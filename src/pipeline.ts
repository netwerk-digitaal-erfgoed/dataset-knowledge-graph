import {Analyzer, AnalyzerError, NotSupported} from './analyzer.js';
import {SummaryWriter} from './writer.js';
import {Selector} from './selector.js';
import {Store} from 'n3';
import {withProvenance} from './provenance.js';

export class Pipeline {
  constructor(
    private readonly config: {
      selector: Selector;
      analyzers: Analyzer[];
      writers: SummaryWriter[];
    }
  ) {}

  public async run(): Promise<void> {
    const datasets = await this.config.selector.select();
    console.info(`Selected ${datasets.size} datasets`);
    for (const dataset of datasets) {
      console.info(`Analyzing dataset ${dataset.iri}`);
      const store = new Store();
      for (const analyzer of this.config.analyzers) {
        const start = new Date();
        const result = await analyzer.execute(dataset);
        const end = new Date();
        if (result instanceof NotSupported) {
          console.warn(
            `  ${dataset.iri} not supported by ${analyzer.constructor.name}`
          );
        } else if (result instanceof AnalyzerError) {
          console.warn(
            `  ${dataset.iri} failed with message ${result.message}`
          );
        } else {
          store.addQuads([...withProvenance(result, dataset.iri, start, end)]);
        }
      }
      if (store.size > 0) {
        for (const writer of this.config.writers) {
          await writer.write(dataset, store);
        }
      }
    }
  }
}
