import {
  Pipeline,
  ImportResolver,
  SparqlDistributionResolver,
  SparqlUpdateWriter,
  FileWriter,
  provenancePlugin,
} from '@lde/pipeline';
import {
  createSubjectUriSpaceStage,
  createClassPartitionStage,
  createObjectLiteralsStage,
  createObjectUrisStage,
  createPropertiesStage,
  createSubjectsStage,
  createTriplesStage,
  createClassPropertiesSubjectsStage,
  createClassPropertiesObjectsStage,
  createDatatypesStage,
  createLicensesStage,
  createPerClassObjectClassStage,
  createPerClassDatatypeStage,
  createPerClassLanguageStage,
  createUriSpaceStage,
  createVocabularyStage,
} from '@lde/pipeline-void';
import {createQlever} from '@lde/sparql-qlever';
import {config} from './config.js';
import {createSubjectFilterSelector} from './subjectFilters.js';
import {buildUriSpacesMap} from './uriSpaces.js';
import {ConsoleReporter} from './reporter.js';
import {resolve} from 'node:path';

const uriSpaces = await buildUriSpacesMap();
const {importer, server} = createQlever({
  mode: config.QLEVER_ENV,
  image: config.QLEVER_IMAGE ?? '',
  mountDir: resolve('imports'),
  containerName: 'dkg-qlever',
  port: config.QLEVER_PORT,
  indexName: 'data',
});

const voidStages = await Promise.all([
  createSubjectUriSpaceStage(),
  createClassPartitionStage(),
  createObjectLiteralsStage(),
  createObjectUrisStage(),
  createPropertiesStage(),
  createPerClassObjectClassStage(),
  createSubjectsStage(),
  createTriplesStage(),
  createClassPropertiesSubjectsStage(),
  createClassPropertiesObjectsStage(),
  createDatatypesStage(),
  createPerClassDatatypeStage(),
  createPerClassLanguageStage(),
  createLicensesStage(),
  createUriSpaceStage(uriSpaces),
  createVocabularyStage(),
]);

await new Pipeline({
  datasetSelector: await createSubjectFilterSelector(),
  distributionResolver: new ImportResolver(new SparqlDistributionResolver(), {
    importer,
    server,
  }),
  stages: voidStages,
  plugins: [provenancePlugin()],
  writers: [
    new FileWriter({outputDir: 'output'}),
    new SparqlUpdateWriter({
      endpoint: new URL(
        `${config.GRAPHDB_URL}/repositories/${config.GRAPHDB_REPOSITORY}/statements`,
      ),
      auth: `Basic ${Buffer.from(`${config.GRAPHDB_USERNAME}:${config.GRAPHDB_PASSWORD}`).toString('base64')}`,
    }),
  ],
  reporter: new ConsoleReporter(),
}).run();
