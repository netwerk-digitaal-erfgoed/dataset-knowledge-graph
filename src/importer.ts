import {Dataset, Distribution} from './dataset.js';
import {NotSupported} from './pipeline.js';

export interface Importer {
  execute(dataset: Dataset): Promise<NotSupported | void>;
}

export class RdfDumpImporter implements Importer {
  constructor(private readonly sparqlClient: SparqlClient) {}

  async execute(dataset: Dataset): Promise<NotSupported | void> {
    if (null !== dataset.getSparqlDistribution()) {
      // No import needed if dataset already provides a SPARQL endpoint.
      return;
    }

    const download = dataset.getDownloadDistribution();
    if (null === download || null === download.accessUrl) {
      return new NotSupported('No data dump available');
    }

    await this.sparqlClient.import(dataset, download.accessUrl!);
    const distribution = Distribution.sparql(this.sparqlClient.getEndpoint());

    dataset.distributions.push(distribution);
  }
}

export interface SparqlClient {
  import(dataset: Dataset, distributionUrl: string): Promise<void>;
  getEndpoint(): string;
}
