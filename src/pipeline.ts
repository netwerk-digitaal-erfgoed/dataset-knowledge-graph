import {SummaryWriter} from './writer.js';
import {Selector} from './selector.js';
import {Store} from 'n3';
import {withProvenance} from './provenance.js';
import {Analyzer} from './analyzer.js';
import {DatasetCore} from '@rdfjs/types';
import prettyMilliseconds from 'pretty-ms';
import chalk from 'chalk';
import ora, {Ora} from 'ora';
import {pino, Logger} from 'pino';

export class Success {
  constructor(public readonly data: DatasetCore) {}
}

export class Failure {
  constructor(
    public readonly url: string,
    public readonly message?: string
  ) {}
}

export class NotSupported {
  constructor(public readonly message: string) {}
}

const logger = pino();

export class Pipeline {
  constructor(
    private readonly config: {
      selector: Selector;
      analyzers: Analyzer[];
      writers: SummaryWriter[];
    }
  ) {}

  public async run(): Promise<void> {
    const pipelineStart = performance.now();
    const selectionProgress = ora({
      discardStdin: false,
      text: 'Selecting datasets',
    }).start();
    const datasets = await this.config.selector.select();
    selectionProgress.succeed(
      `Selected ${chalk.bold(datasets.size)} datasets in ${chalk.bold(prettyMilliseconds(performance.now() - pipelineStart))}`
    );
    for (const dataset of datasets) {
      console.info(`\nAnalyzing dataset ${chalk.bold(dataset.iri)}`);
      const store = new Store();
      for (const step of this.config.analyzers) {
        const start = new Date();
        const startTime = performance.now();
        const progress = ora({discardStdin: false}).start();
        progress.text = `Analyzer ${chalk.bold(step.name)}`;
        const result = await step.execute(dataset, {progress, logger});
        progress.suffixText = `took ${chalk.bold(prettyMilliseconds(performance.now() - startTime))}`;
        if (result instanceof NotSupported) {
          progress.suffixText = `skipped: ${chalk.red('not supported')}`;
          progress.fail();
        } else if (result instanceof Failure) {
          progress.suffixText = `failed in ${chalk.bold(prettyMilliseconds(performance.now() - startTime))}: ${chalk.red(result.message)}`;
          progress.fail();
        } else {
          progress.succeed();
          store.addQuads([
            ...withProvenance(result.data, dataset.iri, start, new Date()),
          ]);
        }
      }
      if (store.size > 0) {
        for (const writer of this.config.writers) {
          await writer.write(dataset, store);
        }
      }

      for (const step of this.config.analyzers) {
        await step.finish({logger});
      }
    }
  }
}

export interface Context {
  readonly progress: Ora;
  readonly logger: Logger;
}
