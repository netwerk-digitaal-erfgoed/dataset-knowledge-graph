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
    const downloads = dataset.getDownloadDistributions();
    if (downloads.length === 0) {
      return new NotSupported('No data dump available');
    }

    let result!: ImportSuccessful | ImportFailed;
    for (const download of downloads) {
      result = await this.sparqlClient.import(dataset, download.accessUrl!);
      if (result instanceof ImportSuccessful) {
        return result;
      }
    }

    return result;
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
