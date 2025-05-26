import {Dataset, Distribution} from './dataset.js';
import {QueryEngine} from '@comunica/query-sparql-file';
import {DataFactory, Quad} from 'n3';
import {resolve} from 'node:path';
import {rdfDereferencer} from 'rdf-dereference';
import factory from 'rdf-ext';

export interface Selector {
  select(): Promise<Set<Dataset>>;
}

export class SparqlEndpoint {
  constructor(public readonly url: string) {}
}

export class RdfFile {
  constructor(public readonly path: string) {}
}

export class SparqlQuerySelector implements Selector {
  constructor(
    private readonly config: {
      query: string;
      endpoint: SparqlEndpoint | RdfFile;
    },
    private readonly queryEngine: QueryEngine
  ) {}
  async select(): Promise<Set<Dataset>> {
    const {data} = await rdfDereferencer.dereference(
      resolve('queries/selection/supplemental.ttl'),
      {localFiles: true}
    );
    const supplementalStore = await factory.dataset().import(data);

    const quadStream = await this.queryEngine.queryQuads(this.config.query, {
      distinctConstruct: true,
      sources: [
        this.config.endpoint instanceof SparqlEndpoint
          ? {
              type: 'sparql',
              value: this.config.endpoint.url,
            }
          : {
              type: 'file',
              value: this.config.endpoint.path,
            },
      ],
    });
    const datasets: Set<Dataset> = new Set();

    let dataset: Dataset;
    let distribution: Distribution;
    return new Promise(resolve => {
      quadStream.on('data', (quad: Quad) => {
        if (
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' ===
            quad.predicate.value &&
          'http://www.w3.org/ns/dcat#Dataset' === quad.object.value
        ) {
          const subjectFilter = [
            ...supplementalStore.match(
              quad.subject,
              DataFactory.namedNode(
                'https://data.netwerkdigitaalerfgoed.nl/def/subjectFilter'
              )
            ),
          ][0]?.object.value;
          dataset = new Dataset(
            quad.subject.value,
            [],
            subjectFilter ? subjectFilter + '.' : undefined
          );
          datasets.add(dataset);
        }

        if (
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' ===
            quad.predicate.value &&
          'http://www.w3.org/ns/dcat#Distribution' === quad.object.value
        ) {
          distribution = new Distribution();
          dataset.distributions.push(distribution);
        }

        if ('http://www.w3.org/ns/dcat#accessURL' === quad.predicate.value) {
          distribution.accessUrl = quad.object.value;
        }

        if ('http://www.w3.org/ns/dcat#mediaType' === quad.predicate.value) {
          distribution.mimeType = quad.object.value;
        }

        if ('http://purl.org/dc/terms/modified' === quad.predicate.value) {
          distribution.lastModified = new Date(quad.object.value);
        }

        if ('http://www.w3.org/ns/dcat#byteSize' === quad.predicate.value) {
          distribution.byteSize = parseInt(quad.object.value);
        }
      });
      quadStream.on('end', () => {
        resolve(datasets);
      });
    });
  }
}
