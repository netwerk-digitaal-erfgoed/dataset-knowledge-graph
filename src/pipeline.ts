import {Analyzer, AnalyzerError, NotSupported} from './analyzer';
import {SummaryWriter} from './writer';
import {Selector} from './selector';

export class Pipeline {
  constructor(
    private readonly config: {
      selector: Selector;
      analyzers: Analyzer[];
      writer: SummaryWriter;
    }
  ) {}

  public async run(): Promise<void> {
    const datasets = await this.config.selector.select();
    for (const dataset of datasets) {
      for (const analyzer of this.config.analyzers) {
        const result = await analyzer.execute(dataset);
        if (result instanceof NotSupported) {
          console.warn(
            `Dataset ${dataset.iri} not supported by ${analyzer.constructor.name}`
          );
        } else if (result instanceof AnalyzerError) {
          console.warn(
            `Analysis of ${dataset.iri} failed with message ${result.message}`
          );
        } else {
          // TODO: add provenance.
          this.config.writer.write(result);
        }
      }
    }
  }
}
