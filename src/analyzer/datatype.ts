import {DataFactory, Store} from 'n3';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Dataset, Distribution} from '../dataset.js';
import {Context, Failure, NotSupported, Success} from '../pipeline.js';
import {SparqlEndpointFetcher} from 'fetch-sparql-endpoint';
import {BaseAnalyzer} from '../analyzer.js';

const {namedNode, literal, quad} = DataFactory;

/**
 * Three-phase analyzer for datatype partitions.
 *
 * Phase 1: Get distinct datatypes in the dataset (for dataset-level count)
 * Phase 2: Get distinct classes in the dataset
 * Phase 3: For each class, query property+datatype combinations using BIND
 *
 * The per-class approach with BIND(DATATYPE(?o) AS ?dt) avoids:
 * - Timeout from FILTER(DATATYPE(?o) = <x>) on large triple scans
 * - OOM from GROUP BY ?type ?p ?dt on all classes at once
 */
export class DatatypeAnalyzer extends BaseAnalyzer {
  public readonly name = 'class-property-datatypes';

  constructor(
    private readonly distinctDatatypesQuery: string,
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
    const distinctDatatypesQuery = (
      await readFile(resolve('queries/analysis/distinct-datatypes.rq'))
    ).toString();
    const constructQuery = (
      await readFile(resolve('queries/analysis/class-property-datatypes.rq'))
    ).toString();
    return new DatatypeAnalyzer(distinctDatatypesQuery, constructQuery);
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
      // Phase 1: Get distinct datatypes
      const datatypes = await this.getDistinctDatatypes(
        sparqlDistribution,
        dataset,
      );

      const store = new Store();

      // Add dataset-level datatypes count
      store.addQuad(
        quad(
          namedNode(dataset.iri),
          namedNode('http://ldf.fi/void-ext#datatypes'),
          literal(datatypes.length),
        ),
      );

      // Add each distinct datatype
      for (const datatype of datatypes) {
        store.addQuad(
          quad(
            namedNode(dataset.iri),
            namedNode('http://ldf.fi/void-ext#datatype'),
            namedNode(datatype),
          ),
        );
      }

      if (datatypes.length === 0) {
        return new Success(store);
      }

      // Phase 2: Get distinct classes
      const classes = await this.getDistinctClasses(sparqlDistribution, dataset);

      // Phase 3: For each class, query all property+datatype combinations
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

  private async getDistinctDatatypes(
    distribution: Distribution,
    dataset: Dataset,
  ): Promise<string[]> {
    const query = this.distinctDatatypesQuery
      .replace('#subjectFilter#', dataset.subjectFilter ?? '')
      .replace(
        '#namedGraph#',
        distribution.namedGraph ? `FROM <${distribution.namedGraph}>` : '',
      );

    const bindingsStream = await this.fetcher.fetchBindings(
      distribution.accessUrl!,
      query,
    );

    const datatypes: string[] = [];
    for await (const binding of bindingsStream) {
      // fetch-sparql-endpoint returns bindings as objects with RDF/JS Term objects
      const record = binding as unknown as Record<
        string,
        {value: string; termType: string}
      >;
      const datatype = record['datatype'];
      if (datatype && datatype.termType === 'NamedNode') {
        datatypes.push(datatype.value);
      }
    }

    return datatypes;
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
