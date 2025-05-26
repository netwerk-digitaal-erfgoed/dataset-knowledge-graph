import {Pipeline} from './pipeline.js';
import {SparqlEndpoint, SparqlQuerySelector} from './selector.js';
import {QueryEngine} from '@comunica/query-sparql-file';
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
      endpoint: new SparqlEndpoint(
        'https://triplestore.netwerkdigitaalerfgoed.nl/repositories/registry'
      ),
    },
    queryEngine
  ),
  analyzers: [
    new DistributionAnalyzer(
      new RdfDumpImporter(
        new GraphDBClient({
          url: config.GRAPHDB_IMPORTS_URL as string,
          username: config.GRAPHDB_IMPORTS_USERNAME as string,
          password: config.GRAPHDB_IMPORTS_PASSWORD as string,
          repository: config.GRAPHDB_IMPORTS_REPOSITORY as string,
        })
      )
    ),
    await SparqlQueryAnalyzer.fromFile('class-partition.rq'),
    await SparqlQueryAnalyzer.fromFile('object-literals.rq'),
    await SparqlQueryAnalyzer.fromFile('object-uris.rq'),
    await SparqlQueryAnalyzer.fromFile('properties.rq'),
    await SparqlQueryAnalyzer.fromFile('subjects.rq'),
    await SparqlQueryAnalyzer.fromFile('triples.rq'),
    await SparqlQueryAnalyzer.fromFile('class-properties.rq'),
    await SparqlQueryAnalyzer.fromFile('licenses.rq'),
    new UriSpaceAnalyzer(
      await SparqlQueryAnalyzer.fromFile('object-uri-space.rq')
    ),
    new VocabularyAnalyzer(
      await SparqlQueryAnalyzer.fromFile('entity-properties.rq')
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
