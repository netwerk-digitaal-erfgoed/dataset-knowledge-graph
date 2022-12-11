import {DatasetCore} from 'rdf-js';
import {Writer} from 'n3';
import {writeFile} from 'node:fs/promises';
import {Dataset} from './dataset';
import filenamifyUrl from 'filenamify-url';

export interface SummaryWriter {
  write(dataset: Dataset, summary: DatasetCore): void;
}

export class FileWriter implements SummaryWriter {
  write(dataset: Dataset, summary: DatasetCore): void {
    const writer = new Writer();
    for (const quad of summary) {
      writer.addQuad(quad);
    }
    writer.end(
      async (error, result) =>
        await writeFile(
          `output/${filenamifyUrl(dataset.iri, {replacement: '-'})}.ttl`,
          result
        )
    );
  }
}
