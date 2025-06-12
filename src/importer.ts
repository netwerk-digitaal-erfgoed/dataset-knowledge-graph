import {Dataset} from './dataset.js';
import {Context, NotSupported} from './pipeline.js';
import {Logger} from 'pino';

export interface Importer {
  import(
    dataset: Dataset,
    context?: Context,
  ): Promise<NotSupported | ImportSuccessful | ImportFailed | void>;
  finish(context?: {logger: Logger}): Promise<void>;
}

export class SparqlImporter implements Importer {
  constructor(private readonly sparqlClient: SparqlClient) {}

  async import(
    dataset: Dataset,
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

  async finish(): Promise<void> {}
}

export interface SparqlClient {
  import(
    dataset: Dataset,
    distributionUrl: string,
  ): Promise<ImportSuccessful | ImportFailed>;
}

export class ImportSuccessful {
  constructor(
    public readonly endpoint: string,
    public readonly identifier?: string,
  ) {}
}

export class ImportFailed {
  constructor(
    public readonly downloadUrl: string,
    public readonly error: string,
  ) {}
}
