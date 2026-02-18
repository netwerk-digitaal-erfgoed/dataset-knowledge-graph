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
import {Importer, Server} from '@lde/sparql-qlever';
import {config} from './config.js';
import {createSubjectFilterSelector} from './subjectFilters.js';
import {buildUriSpacesMap} from './uriSpaces.js';
import {ConsoleReporter} from './reporter.js';
import {createTaskRunner} from './task.js';

const uriSpaces = await buildUriSpacesMap();
const taskRunner = createTaskRunner(config);

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
  distributionResolver: new ImportResolver(
    new SparqlDistributionResolver(),
    {
      importer: new Importer({taskRunner}),
      server: new Server({
        taskRunner,
        indexName: 'data',
        port: config.QLEVER_PORT as number,
      }),
    },
  ),
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
