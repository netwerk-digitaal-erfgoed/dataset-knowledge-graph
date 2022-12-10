import {QueryEngine} from '@comunica/query-sparql';
import {Bindings, DatasetCore, Quad, ResultStream} from 'rdf-js';
import {Store} from 'n3';
import {Dataset} from './dataset';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {AsyncIterator} from 'asynciterator';
import {BindingsFactory} from '@comunica/bindings-factory';
import {DataFactory} from 'rdf-data-factory';

export interface Analyzer {
  execute(
    dataset: Dataset
  ): Promise<DatasetCore | NotSupported | AnalyzerError>;
}

export class NotSupported {}
export class AnalyzerError {
  constructor(readonly distributionUrl: string, readonly message?: string) {}
}

export class SparqlQueryAnalyzer implements Analyzer {
  constructor(
    private readonly queryEngine: QueryEngine,
    private readonly query: string,

    private readonly dataFactory = new DataFactory(),
    private readonly bindingsFactory = new BindingsFactory(dataFactory)
  ) {}

  public static async fromFile(queryEngine: QueryEngine, filename: string) {
    return new SparqlQueryAnalyzer(
      queryEngine,
      await fromFile('queries/analysis/' + filename)
    );
  }

  public async execute(
    dataset: Dataset
  ): Promise<DatasetCore | NotSupported | AnalyzerError> {
    const sparqlDistributions = dataset.distributions.filter(
      distribution =>
        distribution.mimeType === 'application/sparql-query' &&
        distribution.accessUrl !== null
    );

    if (sparqlDistributions.length === 0) {
      return new NotSupported();
    }

    console.info(`Analyzing ${sparqlDistributions[0].accessUrl}`);

    const store = new Store();
    try {
      const stream = await this.tryQuery(
        sparqlDistributions[0].accessUrl!,
        dataset
      );
      store.addQuads(await stream.toArray());
    } catch (e) {
      return new AnalyzerError(
        sparqlDistributions[0].accessUrl!,
        e instanceof Error ? e.message : undefined
      );
    }

    return store;
  }

  private async tryQuery(
    endpoint: string,
    dataset: Dataset,
    type?: string
  ): Promise<AsyncIterator<Quad> & ResultStream<Quad>> {
    try {
      return await this.queryEngine.queryQuads(this.query, {
        initialBindings: this.bindingsFactory.fromRecord({
          dataset: this.dataFactory.namedNode(dataset.iri),
        }) as unknown as Bindings,
        sources: [
          {
            type,
            value: endpoint,
          },
        ],
        httpTimeout: 10_000,
      });
    } catch (e) {
      if (type === null) {
        // Retry with explicit SPARQL type, which endpoints need that offer no SPARQL Service Description.
        return await this.tryQuery(endpoint, dataset, 'sparql');
      }

      throw e;
    }
  }
}

export async function fromFile(filename: string) {
  return (await readFile(resolve(filename))).toString();
}
