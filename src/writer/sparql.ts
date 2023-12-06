import {SummaryWriter} from '../writer.js';
import {DatasetCore} from 'rdf-js';
import {Dataset} from '../dataset.js';

export class SparqlWriter implements SummaryWriter {
  constructor(private sparqlClient: SparqlClient) {}

  async write(dataset: Dataset, summary: DatasetCore): Promise<void> {
    this.sparqlClient.store(dataset, summary);
  }
}

export interface SparqlClient {
  store(dataset: Dataset, summary: DatasetCore): void;
}
