import {QueryEngine} from '@comunica/query-sparql';
import {Store} from 'n3';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {AsyncIterator} from 'asynciterator';
import {BindingsFactory} from '@comunica/bindings-factory';
import {DataFactory} from 'rdf-data-factory';
import {Dataset, Distribution} from './dataset.js';
import {Failure, NotSupported, Success} from './pipeline.js';
import {Bindings, Quad, ResultStream} from '@rdfjs/types';

export interface Analyzer {
  execute(dataset: Dataset): Promise<Success | Failure | NotSupported>;
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
  ): Promise<Success | Failure | NotSupported> {
    const sparqlDistribution = dataset.getSparqlDistribution();
    if (null === sparqlDistribution) {
      return new NotSupported('No SPARQL distribution available');
    }

    console.info(`  Analyzing distribution ${sparqlDistribution.accessUrl}`);

    const store = new Store();
    try {
      const stream = await this.tryQuery(sparqlDistribution, dataset);
      store.addQuads(await stream.toArray());
    } catch (e) {
      return new Failure(
        sparqlDistribution.accessUrl!,
        e instanceof Error ? e.message : undefined
      );
    }

    return new Success(store);
  }

  private async tryQuery(
    distribution: Distribution,
    dataset: Dataset,
    type?: string
  ): Promise<AsyncIterator<Quad> & ResultStream<Quad>> {
    try {
      return await this.queryEngine.queryQuads(
        this.query
          .replace('#subjectFilter#', dataset.subjectFilter ?? '')
          .replace(
            '#namedGraph#',
            distribution.namedGraph ? `FROM <${distribution.namedGraph}>` : ''
          ),
        {
          initialBindings: this.bindingsFactory.fromRecord({
            dataset: this.dataFactory.namedNode(dataset.iri),
          }) as unknown as Bindings,
          sources: [
            {
              type: 'sparql',
              value: distribution.accessUrl!,
            },
          ],
          httpTimeout: 300_000, // Some SPARQL queries really take this long.
        }
      );
    } catch (e) {
      if (type !== undefined) {
        // Retry without explicit SPARQL type, which is needed for endpoints that offer a SPARQL Service Description.
        return await this.tryQuery(distribution, dataset);
      }
      throw e;
    }
  }
}

export async function fromFile(filename: string) {
  return (await readFile(resolve(filename))).toString();
}
