import {DatasetCore} from 'rdf-js';
import {Dataset, Distribution} from '../dataset.js';
import {Analyzer, AnalyzerError, NotSupported} from '../analyzer.js';
import {DataFactory, Store} from 'n3';
import quad = DataFactory.quad;
import namedNode = DataFactory.namedNode;
import blankNode = DataFactory.blankNode;
import literal = DataFactory.literal;

class NetworkError {
  constructor(
    public readonly url: string,
    public readonly message: string
  ) {}
}

async function probe(
  distribution: Distribution
): Promise<Response | NetworkError> {
  try {
    if (distribution.isSparql()) {
      return fetch(distribution.accessUrl!, {
        signal: AbortSignal.timeout(5000),
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/sparql-results+json',
        },
        body: `query=${encodeURIComponent('select * { ?s ?p ?o } limit 1')}`,
      });
    }

    return await fetch(distribution.accessUrl!, {
      signal: AbortSignal.timeout(5000),
      method: 'HEAD',
      headers: {Accept: distribution.mimeType!},
    });
  } catch (e) {
    return new NetworkError(distribution.accessUrl!, (e as Error).name);
  }
}

export class DistributionAnalyzer implements Analyzer {
  async execute(
    dataset: Dataset
  ): Promise<DatasetCore | NotSupported | AnalyzerError> {
    const results = await Promise.all(
      dataset.distributions.map(async distribution => await probe(distribution))
    );

    const store = new Store();
    for (const result of results) {
      const action = blankNode();
      store.addQuads([
        quad(
          action,
          namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          namedNode('https://schema.org/Action')
        ),
        quad(
          action,
          namedNode('https://schema.org/target'),
          namedNode(result.url)
        ),
      ]);

      if (result instanceof NetworkError) {
        store.addQuad(
          quad(
            action,
            namedNode('https://schema.org/error'),
            literal(result.message) // TODO: find a URI for this, for example TimeoutError.
          )
        );
      } else if (result.status >= 200 && result.status < 400) {
        const dataDownload = namedNode(result.url);
        store.addQuad(
          quad(action, namedNode('https://schema.org/result'), dataDownload)
        );

        const lastModified = result.headers.get('Last-Modified');
        if (lastModified) {
          store.addQuad(
            quad(
              dataDownload,
              namedNode('https://schema.org/dateModified'),
              literal(
                new Date(lastModified).toISOString(),
                namedNode('http://www.w3.org/2001/XMLSchema#dateTime')
              )
            )
          );
        }

        const contentSize = result.headers.get('Content-Length');
        if (contentSize) {
          store.addQuad(
            quad(
              dataDownload,
              namedNode('https://schema.org/contentSize'),
              literal(contentSize)
            )
          );
        }
      } else {
        store.addQuads([
          quad(
            action,
            namedNode('https://schema.org/error'),
            namedNode(
              `https://www.w3.org/2011/http-statusCodes#${result.statusText.replace(
                / /g,
                ''
              )}`
            )
          ),
        ]);
      }
    }

    return store;
  }
}
