import {Analyzer} from './analyzer';
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
    console.log(datasets);
  }
}
