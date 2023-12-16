import {Pipeline} from './pipeline.js';
import {SparqlQuerySelector} from './selector.js';
import {QueryEngine} from '@comunica/query-sparql';
import {FileWriter} from './writer.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {SparqlQueryAnalyzer} from './analyzer.js';
import {UriSpaceAnalyzer} from './analyzer/uriSpace.js';
import {DistributionAnalyzer} from './analyzer/distribution.js';
import {SparqlWriter} from './writer/sparql.js';
import {config} from './config.js';
import {RdfDumpImporter} from './importer.js';
import {GraphDBClient} from './graphdb.js';
import {VocabularyAnalyzer} from './analyzer/vocabulary.js';

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
    new DistributionAnalyzer(
      new RdfDumpImporter(
        new GraphDBClient({
          url: config.GRAPHDB_URL as string,
          username: config.GRAPHDB_USERNAME as string,
          password: config.GRAPHDB_PASSWORD as string,
          repository: `${config.GRAPHDB_REPOSITORY}-imports` as string,
        })
      )
    ),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'class-partition.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'object-literals.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'object-uris.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'properties.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'subjects.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'triples.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'class-properties.rq'),
    await SparqlQueryAnalyzer.fromFile(queryEngine, 'licenses.rq'),
    new UriSpaceAnalyzer(
      await SparqlQueryAnalyzer.fromFile(queryEngine, 'object-uri-space.rq')
    ),
    new VocabularyAnalyzer(
      await SparqlQueryAnalyzer.fromFile(queryEngine, 'entity-properties.rq')
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
