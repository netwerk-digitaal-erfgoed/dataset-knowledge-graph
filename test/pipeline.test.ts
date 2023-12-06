import {Pipeline} from '../src/pipeline.js';
import {QueryEngine} from '@comunica/query-sparql';
import {SparqlQuerySelector} from '../src/selector.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {FileWriter} from '../src/writer.js';

describe('Pipeline', () => {
  it('runs', async () => {
    const queryEngine = new QueryEngine();
    const pipeline = new Pipeline({
      selector: new SparqlQuerySelector(
        {
          query: (
            await readFile(
              resolve('queries/selection/dataset-with-rdf-distribution.rq')
            )
          ).toString(),
          endpoint:
            'https://triplestore.netwerkdigitaalerfgoed.nl/repositories/registry',
        },
        queryEngine
      ),
      steps: [],
      writers: [new FileWriter()],
    });
    await pipeline.run();
  });
});
