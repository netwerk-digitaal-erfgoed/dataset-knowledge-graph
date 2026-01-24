import {Importer, ImportFailed, ImportSuccessful} from './importer.js';
import {Context, NotSupported} from './pipeline.js';
import {Downloader} from './import/download.js';
import {Dataset, Distribution} from './dataset.js';
import {writeFile} from 'node:fs/promises';
import {Task, TaskRunner} from './task.js';
import {basename, dirname} from 'path';
import {waitForSparqlEndpointAvailable} from './import/waitForSparql.js';
import {Logger} from 'pino';

type fileFormat = 'nt' | 'nq' | 'ttl';

export interface QleverImporterOptions {
  taskRunner: TaskRunner<Task>;
  indexName?: string;
  port?: number;
}

export class QleverImporter implements Importer {
  private serverTask?: Task;
  private readonly options: QleverImporterOptions;
  private readonly downloader: Downloader = new Downloader();

  constructor(options: QleverImporterOptions) {
    this.options = {
      indexName: 'data',
      port: 7001,
      ...options,
    };
  }
  async import(
    dataset: Dataset,
    context: Context,
  ): Promise<NotSupported | ImportSuccessful | ImportFailed | void> {
    const downloadDistributions = dataset.getDownloadDistributions();
    if (downloadDistributions.length === 0) {
      return new NotSupported('No valid data dump available');
    }

    let result!: ImportSuccessful | ImportFailed;
    for (const downloadDistribution of downloadDistributions) {
      try {
        result = await this.doImport(downloadDistribution, context);
        if (result instanceof ImportSuccessful) {
          return result;
        }
      } catch (error) {
        let errorMessage;
        if (error instanceof AggregateError) {
          errorMessage = error.errors.join(' / ');
        } else {
          errorMessage = (error as Error).message;
        }
        result = new ImportFailed(
          downloadDistribution.accessUrl!,
          errorMessage,
        );
      }
    }

    return result;
  }

  async doImport(
    distribution: Distribution,
    context: Context,
  ): Promise<ImportSuccessful | ImportFailed> {
    context.progress.suffixText = `downloading ${distribution.accessUrl}`;
    const localFile = await this.downloader.download(distribution, context);
    context.progress.suffixText = `indexing ${distribution.accessUrl}`;
    await this.index(
      localFile,
      this.fileFormatFromMimeType(distribution.mimeType!),
    );

    const sparqlEndpoint = `http://localhost:${this.options.port}/sparql`;
    await waitForSparqlEndpointAvailable(sparqlEndpoint);

    return new ImportSuccessful(sparqlEndpoint);
  }

  fileFormatFromMimeType(mimeType: string): fileFormat {
    switch (mimeType) {
      case 'application/n-triples':
      case 'application/n-triples+gzip':
        return 'nt';
      case 'application/n-quads':
      case 'application/n-quads+gzip':
        return 'nq';
      case 'text/turtle':
      case 'text/turtle+gzip':
        return 'ttl';
      default:
        throw new Error(`Unsupported media type: ${mimeType}`);
    }
  }

  async index(file: string, format: fileFormat): Promise<void> {
    const workingDir = dirname(file);
    const settingsFile = 'index.settings.json';
    await writeFile(
      `${workingDir}/${settingsFile}`,
      JSON.stringify({
        'ascii-prefixes-only': true,
        'num-triples-per-batch': 10000,
      }),
    );

    // TODO: write index to named volume instead of bind mount for better performance.

    // Escape single quotes for shell safety - use single quotes to avoid ! expansion.
    const escapedFilename = basename(file).replace(/'/g, "'\\''");
    const indexTask = await this.options.taskRunner.run(
      `(zcat '${escapedFilename}' 2>/dev/null || cat '${escapedFilename}') | qlever-index -i ${this.options.indexName} -s ${settingsFile} -F ${format} -f -`,
    );
    await this.options.taskRunner.wait(indexTask);

    this.serverTask = await this.options.taskRunner.run(
      `qlever-server --index-basename ${this.options.indexName} --memory-max-size 6G --port ${this.options.port}`,
    );
  }

  async finish(context?: {logger: Logger}): Promise<void> {
    if (this.serverTask === undefined) {
      return;
    }

    const logs = await this.options.taskRunner.stop(this.serverTask);
    context?.logger.debug(logs);

    this.serverTask = undefined;
  }
}
