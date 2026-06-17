import {
  Pipeline,
  ImportResolver,
  SparqlDistributionResolver,
  FileWriter,
  FileLoadedSparqlProvenanceStore,
  adaptiveTimeoutPolicy,
  provenancePlugin,
  schemaOrgNormalizationPlugin,
  type Writer,
} from '@lde/pipeline';
import {PIPELINE_VERSION} from './pipelineVersion.js';
import {voidStages, VOID_STAGE_NAMES} from '@lde/pipeline-void';
import {shaclSampleStages} from '@lde/pipeline-shacl-sampler';
import {ShaclValidator} from '@lde/pipeline-shacl-validator';
import {createQlever} from '@lde/sparql-qlever';
import {config} from './config.js';
import {
  createSubjectFilterSelector,
  DATASET_REGISTER_SPARQL_ENDPOINT,
} from './subjectFilters.js';
import {
  pruneOrphanedGraphs,
  fileGraphPrunerDependencies,
} from './pruneOrphanedGraphs.js';
import {publishRebuildSentinel} from './rebuildSentinel.js';
import {buildUriSpacesMap} from './uriSpaces.js';
import {qualityMeasurementsStage} from './qualityMeasurementsStage.js';
import {iiifStage} from './iiifStage.js';
import {mediaStage} from './mediaStage.js';
import {subjectUriResolution} from './subjectUriResolution.js';
import {ConsoleReporter} from '@lde/pipeline-console-reporter';
import {resolve} from 'node:path';
import type {DatasetSelector} from '@lde/pipeline';
import {validationGraphIri} from './validationGraphIri.js';
import {validityGraphIri} from './validityGraphIri.js';
import {ValidityVerdictCollector} from './validityVerdictCollector.js';
import {writeDistributionValidity} from './writeDistributionValidity.js';

const SCHEMA_AP_NDE_SHAPES =
  'https://raw.githubusercontent.com/netwerk-digitaal-erfgoed/schema-profile/main/shacl.ttl';
const SCHEMA_AP_NDE_PROFILE = 'https://docs.nde.nl/schema-profile/';
const SAMPLES_PER_CLASS = 50;

// SCHEMA-AP-NDE targets schema:Organization (and schema:Person), so a dump that
// contains nothing but its own self-description — a schema:Dataset and the
// publisher Organization that supports it — would otherwise sample that
// publisher, find it trivially conformant (only `name` is required) and report
// the dataset as ‘tested and passed’. But the publisher is the dataset’s own
// administrative metadata, not collection content. We subtract any resource the
// self-description points at via schema:publisher/provider/creator from the
// Organization and Person samples, so a content-less dump drops to
// quads-validated = 0 (‘profile doesn’t apply’). The exclusion is anchored to the
// schema:Dataset/DataCatalog node, never to the predicate alone, so per-work
// creator Organizations — reached from CreativeWork nodes — stay in the sample
// and are still validated. Both http:// and https://schema.org/ forms are
// matched because the source data may use either.
const SELF_DESCRIPTION_PUBLISHER_EXCLUSION = `MINUS {
  ?selfDescription a ?selfDescriptionType .
  FILTER(?selfDescriptionType IN (
    <https://schema.org/Dataset>, <http://schema.org/Dataset>,
    <https://schema.org/DataCatalog>, <http://schema.org/DataCatalog>
  ))
  ?selfDescription ?publisherPredicate ?s .
  FILTER(?publisherPredicate IN (
    <https://schema.org/publisher>, <http://schema.org/publisher>,
    <https://schema.org/provider>, <http://schema.org/provider>,
    <https://schema.org/creator>, <http://schema.org/creator>
  ))
}`;
const SELF_DESCRIPTION_TARGET_CLASSES = new Set([
  'https://schema.org/Organization',
  'http://schema.org/Organization',
  'https://schema.org/Person',
  'http://schema.org/Person',
]);
const IIIF_MANIFEST_SAMPLE_SIZE = 10;
const SUBJECT_URI_SAMPLE_SIZE = 10;

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
  // Enrich the subject-uri-space stage: sample the dataset’s own subject
  // namespace and measure whether those URIs resolve, layering PID detection
  // on top. The terminology prefixes are excluded so we pick the namespace the
  // dataset mints for its own resources, not a referenced terminology source.
  transforms: {
    [VOID_STAGE_NAMES.subjectUriSpace]: subjectUriResolution({
      terminologyPrefixes: uriSpaces.keys(),
      sampleSize: SUBJECT_URI_SAMPLE_SIZE,
    }),
  },
});

// Validation reports go to:
//  - output/validation/ (Turtle files, one per dataset; for offline inspection)
//  - the n-quads output cache, per dataset, each quad in a derived
//    "shacl-validation" graph so operators can query violations once the serving
//    QLever has indexed them (see validationGraphIri for the graph IRI scheme).
const validationReportWriters: Writer[] = [
  new FileWriter({outputDir: 'output/validation', format: 'turtle'}),
  new FileWriter({
    outputDir: config.OUTPUT_VALIDATION_CACHE_DIR,
    format: 'n-quads',
    graphIri: dataset => validationGraphIri(dataset.iri),
  }),
];

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
  excludeResources: targetClass =>
    SELF_DESCRIPTION_TARGET_CLASSES.has(targetClass.value)
      ? SELF_DESCRIPTION_PUBLISHER_EXCLUSION
      : '',
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

// Collect every RDF-validity verdict the pipeline emits — including for
// distributions whose RDF failed to import, whose datasets produce no summary —
// so the post-run pass below can persist them. Passed alongside the console
// reporter so both observe the same run (Pipeline fans an array out to each).
const validityCollector = new ValidityVerdictCollector();
const reporter = [new ConsoleReporter(), validityCollector];

// The validity verdicts are written by a post-run pass (not a stage) into their
// own graph and cache directory, mirroring the SHACL validation reports: each
// quad in its derived validityGraphIri graph, the file named after the dataset.
const validityWriter = new FileWriter({
  outputDir: config.OUTPUT_VALIDITY_CACHE_DIR,
  format: 'n-quads',
  graphIri: dataset => validityGraphIri(dataset.iri),
});

// The software credited with the validity verdicts (prov:wasAssociatedWith).
const VALIDITY_PRODUCER =
  'https://www.npmjs.com/package/@netwerk-digitaal-erfgoed/knowledge-graph';

const datasetSelector: DatasetSelector = {
  async select() {
    return (await createSubjectFilterSelector()).select();
  },
};

// Summaries go to:
//  - output/ (Turtle files, one per dataset; for offline inspection)
//  - the n-quads output cache, one file per dataset with every quad in a named
//    graph = the dataset IRI, preserving our one-graph-per-dataset structure.
//    A read-only QLever rebuilds its served index from these files.
const writers: Writer[] = [
  new FileWriter({outputDir: 'output', format: 'turtle'}),
  new FileWriter({
    outputDir: config.OUTPUT_CACHE_DIR,
    format: 'n-quads',
    graphIri: dataset => dataset.iri,
  }),
];

// Per-dataset processing memory, so a run skips datasets whose source and
// pipeline version are both unchanged — before paying the import cost. Reads
// the previous run's records by querying the served (read-only) QLever, and
// writes this run's records as n-quads files (in their own directory, scoped by
// the provenance graph) for the served QLever's next rebuild. Disabled when
// SERVED_SPARQL_ENDPOINT is unset (e.g. local `npm run dev`), in which case
// every dataset is reprocessed.
const provenanceStore = config.SERVED_SPARQL_ENDPOINT
  ? new FileLoadedSparqlProvenanceStore({
      queryEndpoint: new URL(config.SERVED_SPARQL_ENDPOINT),
      pipelineIri: new URL(
        'https://sparql.netwerkdigitaalerfgoed.nl/dataset-knowledge-graph/provenance',
      ),
      outputDir: config.OUTPUT_PROVENANCE_CACHE_DIR,
    })
  : undefined;

try {
  await new Pipeline({
    datasetSelector,
    distributionResolver: new ImportResolver(new SparqlDistributionResolver(), {
      importer,
      server,
    }),
    stages,
    plugins: [schemaOrgNormalizationPlugin(), provenancePlugin()],
    // Skip datasets unchanged since the last run. pipelineVersion is the opaque
    // logic version (managed by release-please); rotating it forces a full
    // reprocess. Ignored when no provenanceStore is configured.
    provenanceStore,
    pipelineVersion: PIPELINE_VERSION,
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

  // Persist the RDF-validity verdicts collected during the run. A post-run pass
  // rather than a stage, so it also records distributions whose RDF failed to
  // import — datasets that produced no summary. Best-effort: a write failure is
  // logged rather than thrown, so it cannot block cache reconciliation below or
  // the rebuild sentinel.
  try {
    const datasetsWithVerdicts = await writeDistributionValidity(
      validityCollector.verdicts(),
      validityWriter,
      {generatedAt: new Date(), producer: VALIDITY_PRODUCER},
    );
    console.log(
      `Wrote RDF-validity verdicts for ${datasetsWithVerdicts} dataset(s).`,
    );
  } catch (error) {
    console.error(
      `Writing RDF-validity verdicts skipped: ${(error as Error).message}`,
    );
  }

  // Reconcile the cache with the register: delete the `.nq` files of datasets
  // that have since been removed from the register or whose registration
  // expired, so stale “ghost” datasets stop surfacing once the served index is
  // rebuilt. Failures are logged rather than thrown: the run has already written
  // this run’s files, and the next run reconciles whatever is left.
  try {
    const {prunedGraphs, failedGraphs} = await pruneOrphanedGraphs(
      fileGraphPrunerDependencies({
        registryEndpoint: DATASET_REGISTER_SPARQL_ENDPOINT,
        summaryDir: config.OUTPUT_CACHE_DIR,
        validationDir: config.OUTPUT_VALIDATION_CACHE_DIR,
        validityDir: config.OUTPUT_VALIDITY_CACHE_DIR,
      }),
    );
    console.log(
      `Cache reconciliation: pruned ${prunedGraphs.length} orphaned file(s) ` +
        'against the register keep-set' +
        (failedGraphs.length > 0
          ? `; ${failedGraphs.length} failed to delete: ${failedGraphs.join(', ')}`
          : '.'),
    );
  } catch (error) {
    console.error(`Cache reconciliation skipped: ${(error as Error).message}`);
  }
} finally {
  // Signal the serving QLever to rebuild — on success AND on partial failure —
  // so operators always see the set that was processed this run.
  await publishRebuildSentinel(config.REBUILD_SENTINEL_PATH);
}
