import {Store} from 'n3';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Dataset, Distribution} from '../dataset.js';
import {Context, Failure, NotSupported, Success} from '../pipeline.js';
import {SparqlEndpointFetcher} from 'fetch-sparql-endpoint';
import {BaseAnalyzer} from '../analyzer.js';

/**
 * Base class for two-phase analyzers that iterate over classes.
 *
 * Phase 1: Get distinct classes in the dataset
 * Phase 2: For each class, execute a CONSTRUCT query
 *
 * The per-class approach avoids:
 * - Timeout from GROUP BY on all classes at once
 * - OOM from large result sets
 */
export abstract class PerClassAnalyzer extends BaseAnalyzer {
  constructor(
    protected readonly constructQuery: string,
    protected readonly fetcher: SparqlEndpointFetcher = new SparqlEndpointFetcher(
      {
        timeout: 300_000,
      },
    ),
  ) {
    super();
  }

  protected static async loadQuery(queryFile: string): Promise<string> {
    return (
      await readFile(resolve(`queries/analysis/${queryFile}`))
    ).toString();
  }

  public async execute(
    dataset: Dataset,
    context?: Context,
  ): Promise<Success | Failure | NotSupported> {
    const sparqlDistribution = dataset.getSparqlDistribution();
    if (null === sparqlDistribution) {
      return new NotSupported('No SPARQL distribution available');
    }

    try {
      const store = new Store();

      // Phase 1: Get distinct classes
      const classes = await this.getDistinctClasses(
        sparqlDistribution,
        dataset,
      );

      // Phase 2: For each class, execute the CONSTRUCT query
      // Continue on timeout to get partial results
      for (const classIri of classes) {
        try {
          const partitions = await this.executeConstructQuery(
            sparqlDistribution,
            dataset,
            classIri,
          );
          store.addQuads([...partitions]);
        } catch (e) {
          // Log but continue with other classes
          context?.logger?.warn(
            `${this.name} query failed for class ${classIri}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }

      return new Success(store);
    } catch (e) {
      return new Failure(
        sparqlDistribution.accessUrl!,
        e instanceof Error ? e.message : undefined,
      );
    }
  }

  private async getDistinctClasses(
    distribution: Distribution,
    dataset: Dataset,
  ): Promise<string[]> {
    const query = `
SELECT DISTINCT ?class
${distribution.namedGraph ? `FROM <${distribution.namedGraph}>` : ''}
WHERE {
    ${dataset.subjectFilter ?? ''}
    ?s a ?class .
}`;

    const bindingsStream = await this.fetcher.fetchBindings(
      distribution.accessUrl!,
      query,
    );

    const classes: string[] = [];
    for await (const binding of bindingsStream) {
      const record = binding as unknown as Record<
        string,
        {value: string; termType: string}
      >;
      const classNode = record['class'];
      if (classNode && classNode.termType === 'NamedNode') {
        classes.push(classNode.value);
      }
    }

    return classes;
  }

  private async executeConstructQuery(
    distribution: Distribution,
    dataset: Dataset,
    classIri: string,
  ): Promise<Store> {
    const query = this.constructQuery
      .replace('#subjectFilter#', dataset.subjectFilter ?? '')
      .replace(
        '#namedGraph#',
        distribution.namedGraph ? `FROM <${distribution.namedGraph}>` : '',
      )
      .replace(/#class#/g, classIri)
      .replace('?dataset', `<${dataset.iri}>`);

    const store = new Store();
    const stream = await this.fetcher.fetchTriples(
      distribution.accessUrl!,
      query,
    );
    for await (const q of stream) {
      store.addQuad(q);
    }

    return store;
  }
}
