import {
  Pipeline,
  ImportResolver,
  SparqlDistributionResolver,
  FileWriter,
  provenancePlugin,
} from '@lde/pipeline';
import {GraphDbWriter} from './graphDbWriter.js';
import {
  subjectUriSpaces,
  classPartitions,
  countObjectLiterals,
  countObjectUris,
  countProperties,
  countSubjects,
  countTriples,
  classPropertySubjects,
  classPropertyObjects,
  countDatatypes,
  detectLicenses,
  perClassObjectClasses,
  perClassDatatypes,
  perClassLanguages,
  uriSpaces,
  detectVocabularies,
} from '@lde/pipeline-void';
import {createQlever} from '@lde/sparql-qlever';
import {config} from './config.js';
import {createSubjectFilterSelector} from './subjectFilters.js';
import {buildUriSpacesMap} from './uriSpaces.js';
import {ConsoleReporter} from './reporter.js';
import {resolve} from 'node:path';
import type {DatasetSelector} from '@lde/pipeline';

const uriSpaceMap = await buildUriSpacesMap();
const {importer, server} = createQlever({
  mode: config.QLEVER_ENV,
  image: config.QLEVER_IMAGE ?? '',
  mountDir: resolve('imports'),
  containerName: 'dkg-qlever',
  port: config.QLEVER_PORT,
  indexName: 'data',
});

const voidStages = await Promise.all([
  subjectUriSpaces(),
  classPartitions(),
  countObjectLiterals(),
  countObjectUris(),
  countProperties(),
  perClassObjectClasses(),
  countSubjects(),
  countTriples(),
  classPropertySubjects(),
  classPropertyObjects(),
  countDatatypes(),
  perClassDatatypes(),
  perClassLanguages(),
  detectLicenses(),
  uriSpaces(uriSpaceMap),
  detectVocabularies(),
]);

const reporter = new ConsoleReporter();

const datasetSelector: DatasetSelector = {
  async select() {
    const paginator = await (await createSubjectFilterSelector()).select();
    reporter.datasetsSelected((paginator as {total: number}).total);
    return paginator;
  },
};

await new Pipeline({
  datasetSelector,
  distributionResolver: new ImportResolver(new SparqlDistributionResolver(), {
    importer,
    server,
  }),
  stages: voidStages,
  plugins: [provenancePlugin()],
  writers: [
    new FileWriter({outputDir: 'output'}),
    new GraphDbWriter({
      endpoint: new URL(
        `${config.GRAPHDB_URL}/repositories/${config.GRAPHDB_REPOSITORY}/statements`,
      ),
      auth: `Basic ${Buffer.from(`${config.GRAPHDB_USERNAME}:${config.GRAPHDB_PASSWORD}`).toString('base64')}`,
    }),
  ],
  reporter,
}).run();
