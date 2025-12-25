import {Store} from 'n3';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Dataset, Distribution} from '../dataset.js';
import {Context, Failure, NotSupported, Success} from '../pipeline.js';
import {SparqlEndpointFetcher} from 'fetch-sparql-endpoint';
import {BaseAnalyzer} from '../analyzer.js';

/**
 * Two-phase analyzer for class+property datatype partitions.
 *
 * Phase 1: Get distinct classes in the dataset
 * Phase 2: For each class, query property+datatype combinations using BIND
 *
 * Dataset-level datatypes are handled separately by datatypes.rq.
 *
 * The per-class approach with BIND(DATATYPE(?o) AS ?dt) avoids:
 * - Timeout from FILTER(DATATYPE(?o) = <x>) on large triple scans
 * - OOM from GROUP BY ?type ?p ?dt on all classes at once
 */
export class DatatypeAnalyzer extends BaseAnalyzer {
  public readonly name = 'class-property-datatypes';

  constructor(
    private readonly constructQuery: string,
    private readonly fetcher: SparqlEndpointFetcher = new SparqlEndpointFetcher(
      {
        timeout: 300_000,
      },
    ),
  ) {
    super();
  }

  public static async create(): Promise<DatatypeAnalyzer> {
    const constructQuery = (
      await readFile(resolve('queries/analysis/class-property-datatypes.rq'))
    ).toString();
    return new DatatypeAnalyzer(constructQuery);
  }

  public async execute(
    dataset: Dataset,
    _context?: Context,
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

      // Phase 2: For each class, query all property+datatype combinations
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
          console.warn(
            `Datatype query failed for class ${classIri}: ${e instanceof Error ? e.message : e}`,
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
      .replace(/#class#/g, classIri);

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
