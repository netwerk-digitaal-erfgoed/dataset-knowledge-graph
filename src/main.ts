import {
  Pipeline,
  ImportResolver,
  SparqlDistributionResolver,
  FileWriter,
  SparqlUpdateWriter,
  adaptiveTimeoutPolicy,
  provenancePlugin,
  schemaOrgNormalizationPlugin,
  type Writer,
} from '@lde/pipeline';
import {voidStages} from '@lde/pipeline-void';
import {shaclSampleStages} from '@lde/pipeline-shacl-sampler';
import {ShaclValidator} from '@lde/pipeline-shacl-validator';
import {createQlever} from '@lde/sparql-qlever';
import {config} from './config.js';
import {createSubjectFilterSelector} from './subjectFilters.js';
import {buildUriSpacesMap} from './uriSpaces.js';
import {qualityMeasurementsStage} from './qualityMeasurementsStage.js';
import {iiifStage} from './iiifStage.js';
import {mediaStage} from './mediaStage.js';
import {ConsoleReporter} from '@lde/pipeline-console-reporter';
import {resolve} from 'node:path';
import type {DatasetSelector} from '@lde/pipeline';
import {validationGraphIri} from './validationGraphIri.js';

const SCHEMA_AP_NDE_SHAPES =
  'https://raw.githubusercontent.com/netwerk-digitaal-erfgoed/schema-profile/main/shacl.ttl';
const SCHEMA_AP_NDE_PROFILE = 'https://docs.nde.nl/schema-profile/';
const SAMPLES_PER_CLASS = 50;
const IIIF_MANIFEST_SAMPLE_SIZE = 10;

const uriSpaces = await buildUriSpacesMap();
const {importer, server} = createQlever({
  mode: config.QLEVER_ENV,
  image: config.QLEVER_IMAGE ?? '',
  dataDir: resolve('imports'),
  containerName: 'dkg-qlever',
  port: config.QLEVER_PORT,
  indexName: 'data',
  serverOptions: {
    'memory-max-size': config.QLEVER_MEMORY_MAX_SIZE,
    'default-query-timeout': config.QLEVER_QUERY_TIMEOUT,
  },
});

const voidStageList = await voidStages({
  uriSpaces,
  vocabularies: [
    'http://www.europeana.eu/schemas/edm/',
    'https://personsincontext.org/model#',
    'https://schema.org/',
  ],
  batchSize: 1,
});

// Validation reports go to:
//  - output/validation/ (Turtle files, one per dataset; for offline inspection)
//  - the SPARQL store, per dataset, in a derived "shacl-validation" graph so
//    operators can query violations without parsing files (see
//    validationGraphIri for the graph IRI scheme).
const validationReportWriters: Writer[] = [
  new FileWriter({outputDir: 'output/validation', format: 'turtle'}),
];
if (config.SPARQL_UPDATE_URL) {
  validationReportWriters.push(
    new SparqlUpdateWriter({
      endpoint: new URL(config.SPARQL_UPDATE_URL),
      auth: config.SPARQL_UPDATE_AUTHORIZATION,
      graphIri: dataset => validationGraphIri(dataset.iri),
    }),
  );
}

const schemaApValidator = new ShaclValidator({
  shapesFile: SCHEMA_AP_NDE_SHAPES,
  reportWriters: validationReportWriters,
});

const sampleStages = await shaclSampleStages({
  shapesFile: SCHEMA_AP_NDE_SHAPES,
  samplesPerClass: SAMPLES_PER_CLASS,
  validator: schemaApValidator,
  namespaceAliases: [
    {canonical: 'https://schema.org/', alias: 'http://schema.org/'},
  ],
});

const stages = [
  ...voidStageList,
  ...sampleStages,
  // mediaStage runs before iiifStage so the media subset its capability subset
  // nests under is present when the IIIF stage asserts the containment edge.
  await mediaStage(),
  await iiifStage({manifestSampleSize: IIIF_MANIFEST_SAMPLE_SIZE}),
  qualityMeasurementsStage({
    validator: schemaApValidator,
    profile: SCHEMA_AP_NDE_PROFILE,
    samplesPerClass: SAMPLES_PER_CLASS,
  }),
];

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
  // Fast-fail endpoints that repeatedly time out so one bad dataset doesn’t
  // hold up the run for hours. After two consecutive timeouts on the same
  // endpoint, subsequent requests get a 10s budget instead of the default; a
  // single successful request relaxes back to the default.
  timeout: adaptiveTimeoutPolicy({
    defaultMs: config.SPARQL_REQUEST_TIMEOUT_MS,
    tightenedMs: 10_000,
    tightenAfterTimeouts: 2,
  }),
  writers,
  reporter,
}).run();
