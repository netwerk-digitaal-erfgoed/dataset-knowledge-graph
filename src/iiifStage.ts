import {resolve} from 'node:path';
import {Stage, SparqlConstructReader, readQueryFile} from '@lde/pipeline';
import {IiifValidationReader} from './iiifValidationReader.js';
import {
  iiifManifestFormatFilter,
  iiifConformantFormatFilter,
} from './iiifManifestDetection.js';

const QUERY_FILE = resolve('queries/analysis/iiif.rq');

/** Default number of manifest IRIs sampled per dataset for verification. */
export const DEFAULT_MANIFEST_SAMPLE_SIZE = 10;

export interface IiifStageOptions {
  /**
   * Number of manifest IRIs to sample and dereference per dataset. Threaded
   * into the detection query's `#limit#` placeholder. First-N (not random)
   * sampling: cheap and reproducible for a provenance-bearing measurement.
   *
   * @default 10
   */
  manifestSampleSize?: number;
}

/**
 * Detect IIIF Presentation manifests in a dataset and emit a `void:subset`
 * keyed on `dcterms:conformsTo <http://iiif.io/api/presentation/>` with a
 * `void:entities` count of distinct manifests, then *verify* a sample of those
 * manifests by dereferencing them.
 *
 * Detection is *decoupled* from SCHEMA-AP-NDE conformance (issue #314): a
 * resource counts as IIIF capability if its `schema:encodingFormat` literal is
 * either the full profile pattern *or* the bare `application/ld+json` media
 * type — so a working manifest declared without the `;profile=` parameter is
 * not missed. The profile-conformant manifests are emitted as a nested
 * `void:subset` keyed on `dcterms:conformsTo <https://docs.nde.nl/schema-profile/>`,
 * encoding `conformant ⊆ capability`. The declared capability marker is never
 * removed — it distinguishes “no IIIF” from “declared but failing”. Validation
 * adds two DQV measurements (`manifests-sampled`, `manifests-validated`),
 * computed on the capability subset, so consumers can tell working manifests
 * apart from broken ones.
 *
 * Per-request timeout for the SPARQL query is configured at the
 * {@link Pipeline} level via `PipelineOptions.timeout`; the manifest
 * dereference timeout is owned by `@lde/iiif-validator`.
 */
export async function iiifStage(
  options: IiifStageOptions = {},
): Promise<Stage> {
  const sampleSize = options.manifestSampleSize ?? DEFAULT_MANIFEST_SAMPLE_SIZE;
  // The manifest detection rule lives in iiifManifestDetection.ts, shared with
  // the subject-URI sampler so the two cannot drift; weave it into the query
  // here, the same way #limit# is substituted.
  const query = (await readQueryFile(QUERY_FILE))
    .replaceAll('#limit#', String(sampleSize))
    .replaceAll('#manifestFormatFilter#', iiifManifestFormatFilter('format'))
    .replaceAll(
      '#conformantFormatFilter#',
      iiifConformantFormatFilter('format'),
    );
  // `deduplicate` collapses the constant subset/conformsTo/entities triples,
  // which the COUNT × sample cross-join repeats once per sampled row.
  const detection = new SparqlConstructReader({query, deduplicate: true});
  return new Stage({
    name: 'iiif.rq',
    readers: new IiifValidationReader(detection),
  });
}
