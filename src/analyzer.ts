import {Store} from 'n3';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Dataset, Distribution} from './dataset.js';
import {Failure, NotSupported, Success} from './pipeline.js';
import {Stream} from '@rdfjs/types';
import {SparqlEndpointFetcher} from 'fetch-sparql-endpoint';
import type {Readable} from 'node:stream';

export interface Analyzer {
  readonly name: string;
  execute(dataset: Dataset): Promise<Success | Failure | NotSupported>;
}

export class SparqlQueryAnalyzer implements Analyzer {
  constructor(
    public readonly name: string,
    private readonly query: string,
    private readonly fetcher: SparqlEndpointFetcher = new SparqlEndpointFetcher(
      {
        timeout: 300_000, // Some SPARQL queries really take this long.
      }
    )
  ) {}

  public static async fromFile(filename: string) {
    return new SparqlQueryAnalyzer(
      filename,
      await fromFile('queries/analysis/' + filename)
    );
  }

  public async execute(
    dataset: Dataset
  ): Promise<Success | Failure | NotSupported> {
    const sparqlDistribution = dataset.getSparqlDistribution();
    if (null === sparqlDistribution) {
      return new NotSupported('No SPARQL distribution available');
    }

    const store = new Store();
    try {
      const stream = await this.executeQuery(sparqlDistribution, dataset);
      for await (const q of stream) {
        store.addQuad(q);
      }
    } catch (e) {
      return new Failure(
        sparqlDistribution.accessUrl!,
        e instanceof Error ? e.message : undefined
      );
    }

    return new Success(store);
  }

  private async executeQuery(
    distribution: Distribution,
    dataset: Dataset
  ): Promise<Readable & Stream> {
    const query = this.query
      .replace('#subjectFilter#', dataset.subjectFilter ?? '')
      .replace('?dataset', `<${dataset.iri}>`)
      .replace(
        '#namedGraph#',
        distribution.namedGraph ? `FROM <${distribution.namedGraph}>` : ''
      );

    return await this.fetcher.fetchTriples(distribution.accessUrl!, query);
  }
}

export async function fromFile(filename: string) {
  return (await readFile(resolve(filename))).toString();
}
