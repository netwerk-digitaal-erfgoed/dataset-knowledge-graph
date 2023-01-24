import {Pipeline} from './pipeline';
import {DatasetSelector} from './selector';
import {QueryEngine} from '@comunica/query-sparql';
import {FileWriter} from './writer';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {SparqlQueryAnalyzer} from './analyzer/sparqlqueryanalyzer';
import {UriSpaceAnalyzer} from './analyzer/uriSpace';
import { DistributionLinksAnalyzer } from './analyzer/distributionlinksanalyzer';

const queryEngine = new QueryEngine();

/*
new Pipeline({
  selector: new DatasetSelector(
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
  ],
  writer: new FileWriter(),
}).run();

*/

new Pipeline({
  selector: new DatasetSelector(
    {
      query: (
        await readFile(resolve('queries/selection/all-distributions.rq'))
      ).toString(),
      endpoint:
        'https://triplestore.netwerkdigitaalerfgoed.nl/repositories/registry',
    },
    queryEngine
  ),
  analyzers: [
    await DistributionLinksAnalyzer.init(),
  ],
  writer: new FileWriter(),
}).run();


/* 
Parked for now:
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
*/
