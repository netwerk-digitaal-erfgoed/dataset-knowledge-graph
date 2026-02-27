import {
  Pipeline,
  ImportResolver,
  SparqlDistributionResolver,
  FileWriter,
  SparqlUpdateWriter,
  provenancePlugin,
  type Writer,
} from '@lde/pipeline';
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

const writers: Writer[] = [
  new FileWriter({outputDir: 'output', format: 'n-triples'}),
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
  stages: voidStages,
  plugins: [provenancePlugin()],
  writers,
  reporter,
}).run();
