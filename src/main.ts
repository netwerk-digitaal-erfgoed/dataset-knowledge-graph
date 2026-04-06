import {
  Pipeline,
  ImportResolver,
  SparqlDistributionResolver,
  FileWriter,
  SparqlUpdateWriter,
  provenancePlugin,
  schemaOrgNormalizationPlugin,
  type Writer,
} from '@lde/pipeline';
import {voidStages} from '@lde/pipeline-void';
import {createQlever} from '@lde/sparql-qlever';
import {config} from './config.js';
import {createSubjectFilterSelector} from './subjectFilters.js';
import {buildUriSpacesMap} from './uriSpaces.js';
import {ConsoleReporter} from '@lde/pipeline-console-reporter';
import {resolve} from 'node:path';
import type {DatasetSelector} from '@lde/pipeline';

const uriSpaces = await buildUriSpacesMap();
const {importer, server} = createQlever({
  mode: config.QLEVER_ENV,
  image: config.QLEVER_IMAGE ?? '',
  dataDir: resolve('imports'),
  containerName: 'dkg-qlever',
  port: config.QLEVER_PORT,
  indexName: 'data',
  serverOptions: {
    'memory-max-size': '16G',
    'default-query-timeout': '120s',
  },
});

const stages = await voidStages({
  uriSpaces,
  vocabularies: [
    'http://www.europeana.eu/schemas/edm/',
    'https://personsincontext.org/model#',
    'https://schema.org/',
  ],
  batchSize: 1,
});

const reporter = new ConsoleReporter();

const datasetSelector: DatasetSelector = {
  async select() {
    return (await createSubjectFilterSelector()).select();
  },
};

const writers: Writer[] = [
  new FileWriter({outputDir: 'output', format: 'turtle'}),
];
if (config.SPARQL_UPDATE_URL) {
  writers.push(
    new SparqlUpdateWriter({
      endpoint: new URL(config.SPARQL_UPDATE_URL),
      auth: config.SPARQL_UPDATE_AUTHORIZATION,
    }),
  );
}

await new Pipeline({
  datasetSelector,
  distributionResolver: new ImportResolver(new SparqlDistributionResolver(), {
    importer,
    server,
  }),
  stages,
  plugins: [schemaOrgNormalizationPlugin(), provenancePlugin()],
  writers,
  reporter,
}).run();
