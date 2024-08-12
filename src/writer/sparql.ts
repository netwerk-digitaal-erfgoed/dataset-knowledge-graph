import {SummaryWriter} from '../writer.js';
import {Dataset} from '../dataset.js';
import {DatasetCore} from '@rdfjs/types';

export class SparqlWriter implements SummaryWriter {
  constructor(private sparqlClient: SparqlClient) {}

  async write(dataset: Dataset, summary: DatasetCore): Promise<void> {
    this.sparqlClient.store(dataset, summary);
  }
}

export interface SparqlClient {
  store(dataset: Dataset, summary: DatasetCore): void;
}
