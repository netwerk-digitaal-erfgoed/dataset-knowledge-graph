import {Analyzer, AnalyzerError, NotSupported} from './analyzer';
import {SummaryWriter} from './writer';
import {Selector} from './selector';
import {Store} from 'n3';

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
    console.info(`Selected ${datasets.size} datasets`);
    for (const dataset of datasets) {
      console.info(`Analyzing dataset ${dataset.iri}`);
      const store = new Store();
      for (const analyzer of this.config.analyzers) {
        const result = await analyzer.execute(dataset);
        if (result instanceof NotSupported) {
          console.warn(
            `  ${dataset.iri} not supported by ${analyzer.constructor.name}`
          );
        } else if (result instanceof AnalyzerError) {
          console.warn(
            `  ${dataset.iri} failed with message ${result.message}`
          );
        } else {
          // TODO: add provenance.
          store.addQuads([...result]);
        }
      }
      if (store.size > 0) {
        await this.config.writer.write(dataset, store);
      }
    }
  }
}
