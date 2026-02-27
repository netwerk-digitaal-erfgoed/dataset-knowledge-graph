import type {ProgressReporter} from '@lde/pipeline';
import chalk from 'chalk';
import ora, {type Ora} from 'ora';
import prettyMilliseconds from 'pretty-ms';

export class ConsoleReporter implements ProgressReporter {
  private spinner?: Ora;

  pipelineStart(_name: string): void {
    this.spinner = ora({
      discardStdin: false,
      text: 'Selecting datasets',
    }).start();
  }

  /** Called after datasets are selected; updates the selection spinner with the total count. */
  datasetsSelected(count: number): void {
    if (this.spinner) {
      this.spinner.text = `Selected datasets: found ${chalk.bold(count)} datasets`;
    }
  }

  datasetStart(dataset: string): void {
    this.spinner?.succeed();
    this.spinner = undefined;
    console.info(`\nAnalyzing dataset ${chalk.bold(dataset)}`);
  }

  stageStart(stage: string): void {
    this.spinner = ora({discardStdin: false}).start();
    this.spinner.text = `Stage ${chalk.bold(stage)}`;
  }

  stageProgress(update: {
    elementsProcessed: number;
    quadsGenerated: number;
  }): void {
    if (this.spinner) {
      this.spinner.suffixText = `${update.elementsProcessed} elements, ${update.quadsGenerated} quads`;
    }
  }

  stageComplete(
    _stage: string,
    result: {
      elementsProcessed: number;
      quadsGenerated: number;
      duration: number;
    },
  ): void {
    if (this.spinner) {
      this.spinner.suffixText = `took ${chalk.bold(prettyMilliseconds(result.duration))}`;
      this.spinner.succeed();
    }
  }

  stageFailed(_stage: string, error: Error): void {
    if (this.spinner) {
      this.spinner.suffixText = chalk.red(error.message);
      this.spinner.fail();
    }
  }

  stageSkipped(_stage: string, reason: string): void {
    if (this.spinner) {
      this.spinner.suffixText = `skipped: ${chalk.red(reason)}`;
      this.spinner.fail();
    }
  }

  datasetComplete(_dataset: string): void {}

  datasetSkipped(_dataset: string, reason: string): void {
    if (this.spinner) {
      this.spinner.suffixText = `skipped: ${chalk.red(reason)}`;
      this.spinner.fail();
    } else {
      // No stage spinner: distribution resolution failed before any stage ran.
      const s = ora({discardStdin: false, text: 'Dataset'}).start();
      s.suffixText = `skipped: ${chalk.red(reason)}`;
      s.fail();
    }
    this.spinner = undefined;
  }

  pipelineComplete(result: {duration: number}): void {
    console.info(
      `\nPipeline completed in ${chalk.bold(prettyMilliseconds(result.duration))}`,
    );
  }
}
