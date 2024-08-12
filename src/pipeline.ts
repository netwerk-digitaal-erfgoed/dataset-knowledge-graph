import {SummaryWriter} from './writer.js';
import {Selector} from './selector.js';
import {Store} from 'n3';
import {withProvenance} from './provenance.js';
import {Analyzer} from './analyzer.js';
import {DatasetCore} from '@rdfjs/types';

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
      for (const step of this.config.analyzers) {
        const start = new Date();
        const result = await step.execute(dataset);
        const end = new Date();
        if (result instanceof NotSupported) {
          console.warn(
            `  ${dataset.iri} not supported by ${step.constructor.name}`
          );
        } else if (result instanceof Failure) {
          console.warn(
            `  ${dataset.iri} failed with message ${result.message}`
          );
        } else if (result instanceof Success && result.data) {
          store.addQuads([
            ...withProvenance(result.data, dataset.iri, start, end),
          ]);
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
