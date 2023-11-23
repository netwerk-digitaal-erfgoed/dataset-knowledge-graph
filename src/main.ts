import {Pipeline} from './pipeline.js';
import {SparqlQuerySelector} from './selector.js';
import {QueryEngine} from '@comunica/query-sparql';
import {FileWriter} from './writer.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {SparqlQueryAnalyzer} from './analyzer.js';
import {UriSpaceAnalyzer} from './analyzer/uriSpace.js';

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
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'entity-properties.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'object-literals.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'object-uris.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'properties.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'subjects.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'triples.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'class-properties.rq'),
    new UriSpaceAnalyzer(
      await SparqlQueryAnalyzer.fromFile(queryEngine, 'object-uri-space.rq')
    ),
  ],
  writer: new FileWriter(),
}).run();
