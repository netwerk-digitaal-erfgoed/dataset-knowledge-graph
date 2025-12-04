import {Dataset, Distribution} from '../dataset.js';
import {Analyzer} from '../analyzer.js';
import {DataFactory, Store} from 'n3';
import {Context, Failure, NotSupported, Success} from '../pipeline.js';
import {Importer, ImportFailed, ImportSuccessful} from '../importer.js';
import {Logger} from 'pino';

const {quad, namedNode, blankNode, literal} = DataFactory;

class NetworkError {
  constructor(
    public readonly url: string,
    public readonly message: string,
  ) {}
}

abstract class RdfResult {
  public readonly statusCode: number;
  public readonly statusText: string;
  public readonly lastModified: Date | null = null;
  public readonly contentType: string | null;

  constructor(
    public readonly url: string,
    response: Response,
  ) {
    this.statusCode = response.status;
    this.statusText = response.statusText;
    this.contentType = response.headers.get('Content-Type');
    const lastModifiedHeader = response.headers.get('Last-Modified');
    if (lastModifiedHeader) {
      this.lastModified = new Date(lastModifiedHeader);
    }
  }

  public isSuccess() {
    return this.statusCode >= 200 && this.statusCode < 400;
  }
}

class SparqlProbeResult extends RdfResult {
  public readonly acceptedContentType = 'application/sparql-results+json';

  isSuccess(): boolean {
    return (
      super.isSuccess() &&
      (this.contentType?.startsWith(this.acceptedContentType) ?? false)
    );
  }
}

class DataDumpProbeResult extends RdfResult {
  public readonly contentSize: number | null = null;

  constructor(url: string, response: Response) {
    super(url, response);
    const contentLengthHeader = response.headers.get('Content-Length');
    if (contentLengthHeader) {
      this.contentSize = parseInt(contentLengthHeader);
    }
  }
}

async function probe(
  distribution: Distribution,
): Promise<SparqlProbeResult | DataDumpProbeResult | NetworkError> {
  try {
    if (distribution.isSparql()) {
      const response = await fetch(distribution.accessUrl!, {
        signal: AbortSignal.timeout(5000),
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/sparql-results+json',
        },
        body: `query=${encodeURIComponent('select * { ?s ?p ?o } limit 1')}`,
      });

      const result = new SparqlProbeResult(distribution.accessUrl!, response);
      distribution.isValid = result.isSuccess();
      return result;
    }

    const response = await probeDistribution(distribution);
    const result = new DataDumpProbeResult(distribution.accessUrl!, response);
    distribution.isValid = result.isSuccess();
    distribution.lastModified ??= result.lastModified ?? undefined;
    return result;
  } catch (e) {
    return new NetworkError(
      distribution.accessUrl!,
      (e as Error).cause as string,
    );
  }
}

async function probeDistribution(
  distribution: Distribution,
): Promise<Response> {
  const response = await fetch(distribution.accessUrl!, {
    signal: AbortSignal.timeout(5000),
    method: 'HEAD',
    headers: {
      Accept: distribution.mimeType!,
      'Accept-Encoding': 'identity', // Return uncompressed responses.
    },
  });

  const contentLength = response.headers.get('Content-Length');
  if (contentLength !== null && contentLength !== '0') {
    return response;
  }

  // Retry as GET request for servers incorrectly returning HEAD request Content-Length,
  // which *should* be the size of the response body when issuing a GET, not that of
  // the response to a HEAD request, which is intentionally 0.
  return await fetch(distribution.accessUrl!, {
    signal: AbortSignal.timeout(5000),
    method: 'GET',
    headers: {Accept: distribution.mimeType!},
  });
}

export class DistributionAnalyzer implements Analyzer {
  public readonly name = 'distribution';
  constructor(private readonly importer: Importer) {}

  async execute(
    dataset: Dataset,
    context?: Context,
  ): Promise<Success | NotSupported | Failure> {
    const results = await Promise.all(
      dataset.distributions.map(
        async distribution => await probe(distribution),
      ),
    );

    const store = new Store();
    for (const result of results) {
      const action = blankNode();
      store.addQuads([
        quad(
          action,
          namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          namedNode('https://schema.org/Action'),
        ),
        quad(
          action,
          namedNode('https://schema.org/target'),
          namedNode(result.url),
        ),
      ]);

      if (result instanceof NetworkError) {
        store.addQuad(
          quad(
            action,
            namedNode('https://schema.org/error'),
            literal(result.message), // TODO: find a URI for this, for example TimeoutError.
          ),
        );
      } else if (result.isSuccess()) {
        const distributionUrl = namedNode(result.url);
        store.addQuads([
          quad(action, namedNode('https://schema.org/result'), distributionUrl),
        ]);

        if (result.lastModified) {
          store.addQuad(
            quad(
              distributionUrl,
              namedNode('https://schema.org/dateModified'),
              literal(
                result.lastModified.toISOString(),
                namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
              ),
            ),
          );
        }

        if (result instanceof SparqlProbeResult) {
          store.addQuads([
            quad(
              namedNode(dataset.iri.toString()),
              namedNode('http://rdfs.org/ns/void#sparqlEndpoint'),
              distributionUrl,
            ),
          ]);
        } else {
          store.addQuads([
            quad(
              namedNode(dataset.iri.toString()),
              namedNode('http://rdfs.org/ns/void#dataDump'),
              distributionUrl,
            ),
          ]);

          if (result.contentSize) {
            store.addQuad(
              quad(
                distributionUrl,
                namedNode('https://schema.org/contentSize'),
                literal(result.contentSize),
              ),
            );
          }
        }
      } else {
        store.addQuads([
          quad(
            action,
            namedNode('https://schema.org/error'),
            namedNode(
              `https://www.w3.org/2011/http-statusCodes#${result.statusText.replace(
                / /g,
                '',
              )}`,
            ),
          ),
        ]);
      }
    }

    let error;
    if (null === dataset.getSparqlDistribution()) {
      // Import a dump if dataset does not have a SPARQL endpoint distribution.
      const importResult = await this.importer.import(dataset, context);
      if (importResult instanceof ImportSuccessful) {
        // Add imported SPARQL distribution to dataset so next analyzers can use it.
        const distribution = Distribution.sparql(
          importResult.endpoint,
          importResult.identifier,
        );
        dataset.distributions.push(distribution);
      } else if (importResult instanceof ImportFailed) {
        const actionBlankNode = [
          ...store.match(
            null,
            namedNode('https://schema.org/target'),
            namedNode(importResult.downloadUrl),
          ),
        ][0];
        store.addQuads([
          quad(
            actionBlankNode.subject,
            namedNode('https://schema.org/error'),
            literal(importResult.error),
          ),
        ]);
        error = importResult.error;
      } else {
        error = 'no data dump available';
      }
    }

    if (null === dataset.getSparqlDistribution()) {
      return new Failure(dataset.iri, error);
    }

    return new Success(store);
  }

  async finish(context?: {logger: Logger}): Promise<void> {
    await this.importer.finish(context);
  }
}
