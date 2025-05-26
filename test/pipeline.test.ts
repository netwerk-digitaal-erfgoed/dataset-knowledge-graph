import {Pipeline} from '../src/pipeline.js';
import {QueryEngine} from '@comunica/query-sparql-file';
import {SparqlEndpoint, SparqlQuerySelector} from '../src/selector.js';
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
          endpoint: new SparqlEndpoint(
            'https://triplestore.netwerkdigitaalerfgoed.nl/repositories/registry'
          ),
        },
        queryEngine
      ),
      analyzers: [],
      writers: [new FileWriter()],
    });
    await pipeline.run();
  });
});
