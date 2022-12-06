import {Pipeline} from './pipeline';
import {SparqlQuerySelector} from './selector';
import {QueryEngine} from '@comunica/query-sparql';
import {FileWriter} from './writer';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

await new Pipeline({
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
}).run();
