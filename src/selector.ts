import {Dataset, Distribution} from './dataset';
import {QueryEngine} from '@comunica/query-sparql';
import {Quad} from 'n3';

export interface Selector {
  select(): Promise<Set<Dataset>>;
}

export class DatasetSelector implements Selector {
  constructor(
    private readonly config: {
      query: string;
      endpoint: string;
    },
    private readonly queryEngine: QueryEngine
  ) {}
  async select(): Promise<Set<Dataset>> {
    const quadStream = await this.queryEngine.queryQuads(this.config.query, {
      sources: [
        {
          type: 'sparql',
          value: this.config.endpoint,
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
          dataset = new Dataset(quad.subject.value, []);
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

        if ('http://purl.org/dc/terms/format' === quad.predicate.value) {
          distribution.mimeType = quad.object.value;
        }
      });
      quadStream.on('end', () => {
        resolve(datasets);
      });
    });
  }
}
