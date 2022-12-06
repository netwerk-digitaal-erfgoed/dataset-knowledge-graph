import {Dataset} from './dataset';

export interface SummaryWriter {
  write(dataset: Dataset): void;
}

export class FileWriter implements SummaryWriter {
  write(dataset: Dataset): void {
    console.log(dataset);
  }
}
