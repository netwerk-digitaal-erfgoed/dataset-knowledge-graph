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

  datasetStart(dataset: string): void {
    this.spinner?.succeed();
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

  stageSkipped(_stage: string, reason: string): void {
    if (this.spinner) {
      this.spinner.suffixText = `skipped: ${chalk.red(reason)}`;
      this.spinner.fail();
    }
  }

  datasetComplete(_dataset: string): void {
    // No-op; next datasetStart or pipelineComplete handles output.
  }

  datasetSkipped(_dataset: string, reason: string): void {
    if (this.spinner) {
      this.spinner.suffixText = `skipped: ${chalk.red(reason)}`;
      this.spinner.fail();
    }
  }

  pipelineComplete(result: {duration: number}): void {
    console.info(
      `\nPipeline completed in ${chalk.bold(prettyMilliseconds(result.duration))}`,
    );
  }
}
