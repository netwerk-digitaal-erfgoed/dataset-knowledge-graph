import {Writer} from 'n3';
import {writeFile} from 'node:fs/promises';
import {Dataset} from './dataset.js';
import filenamifyUrl from 'filenamify-url';
import {DatasetCore} from '@rdfjs/types';

export interface SummaryWriter {
  write(dataset: Dataset, summary: DatasetCore): Promise<void>;
}

export class FileWriter implements SummaryWriter {
  async write(dataset: Dataset, summary: DatasetCore): Promise<void> {
    const writer = new Writer({
      prefixes: {
        void: 'http://rdfs.org/ns/void#',
        prov: 'http://www.w3.org/ns/prov#',
      },
    });
    writer.addQuads([...summary]);
    writer.end(
      async (_error, result) =>
        await writeFile(
          `output/${filenamifyUrl(dataset.iri, {replacement: '-'})}.ttl`,
          result
        )
    );
  }
}
