import {Pipeline} from '../src/pipeline';
import {QueryEngine} from '@comunica/query-sparql';
import {SparqlQuerySelector} from '../src/selector';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {FileWriter} from '../src/writer';

describe('Pipeline', () => {
  it('runs', async () => {
    const pipeline = new Pipeline({
      selector: new SparqlQuerySelector(
        {
          query: (
            await readFile(resolve('queries/selection/sparql-endpoints.rq'))
          ).toString(),
          endpoint:
            'https://triplestore.netwerkdigitaalerfgoed.nl/repositories/registry',
        },
        new QueryEngine()
      ),
      analyzers: [],
      writer: new FileWriter(),
    });
    await pipeline.run();
  });
});
