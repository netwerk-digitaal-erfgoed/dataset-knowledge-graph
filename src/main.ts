import {Pipeline} from './pipeline.js';
import {SparqlQuerySelector} from './selector.js';
import {QueryEngine} from '@comunica/query-sparql';
import {FileWriter} from './writer.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {SparqlQueryAnalyzer} from './analyzer.js';
import {UriSpaceAnalyzer} from './analyzer/uriSpace.js';
import {DistributionAnalyzer} from './analyzer/distribution.js';
import {GraphDBClient, SparqlWriter} from './writer/sparql.js';
import {config} from './config.js';

const queryEngine = new QueryEngine();
new Pipeline({
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
  analyzers: [
    new DistributionAnalyzer(),
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
  writers: [
    new FileWriter(),
    new SparqlWriter(
      new GraphDBClient({
        url: config.GRAPHDB_URL as string,
        username: config.GRAPHDB_USERNAME as string,
        password: config.GRAPHDB_PASSWORD as string,
        repository: config.GRAPHDB_REPOSITORY as string,
      })
    ),
  ],
}).run();
