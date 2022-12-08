import {Pipeline} from './pipeline';
import {SparqlQuerySelector} from './selector';
import {QueryEngine} from '@comunica/query-sparql';
import {FileWriter} from './writer';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {SparqlQueryAnalyzer} from './analyzer';

const queryEngine = new QueryEngine();
new Pipeline({
  selector: new SparqlQuerySelector(
    {
      query: (
        await readFile(resolve('queries/selection/sparql-endpoints.rq'))
      ).toString(),
      endpoint:
        'https://triplestore.netwerkdigitaalerfgoed.nl/repositories/registry',
    },
    queryEngine
  ),
  analyzers: [
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'class-partition.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'class-properties.rq'),
  ],
  writer: new FileWriter(),
}).run();
