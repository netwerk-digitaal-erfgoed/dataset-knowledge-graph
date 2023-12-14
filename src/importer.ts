import {Dataset} from './dataset.js';
import {NotSupported} from './pipeline.js';

export interface Importer {
  import(
    dataset: Dataset
  ): Promise<NotSupported | ImportSuccessful | ImportFailed | void>;
}

export class RdfDumpImporter implements Importer {
  constructor(private readonly sparqlClient: SparqlClient) {}

  async import(
    dataset: Dataset
  ): Promise<NotSupported | ImportSuccessful | ImportFailed> {
    const download = dataset.getDownloadDistribution();
    if (null === download || undefined === download.accessUrl) {
      return new NotSupported('No data dump available');
    }

    return await this.sparqlClient.import(dataset, download.accessUrl);
  }
}

export interface SparqlClient {
  import(
    dataset: Dataset,
    distributionUrl: string
  ): Promise<ImportSuccessful | ImportFailed>;
}

export class ImportSuccessful {
  constructor(
    public readonly endpoint: string,
    public readonly identifier: string
  ) {}
}

export class ImportFailed {
  constructor(
    public readonly downloadUrl: string,
    public readonly error: string
  ) {}
}
