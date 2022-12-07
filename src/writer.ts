import {DatasetCore} from 'rdf-js';
import {Writer} from 'n3';

export interface SummaryWriter {
  write(dataset: DatasetCore): void;
}

export class FileWriter implements SummaryWriter {
  write(dataset: DatasetCore): void {
    const writer = new Writer();
    for (const quad of dataset) {
      writer.addQuad(quad);
    }
    writer.end((error, result) => console.log(result));
  }
}
