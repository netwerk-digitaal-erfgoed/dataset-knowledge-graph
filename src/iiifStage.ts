import {resolve} from 'node:path';
import {Stage, SparqlConstructExecutor, readQueryFile} from '@lde/pipeline';
import {IiifValidationExecutor} from './iiifValidationExecutor.js';

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
 * Detection mirrors SCHEMA-AP-NDE’s `_:IIIFPresentationManifestShape`: a
 * resource is a IIIF manifest iff its `schema:encodingFormat` literal matches
 * the JSON-LD context-profile pattern for any IIIF Presentation version. The
 * declared `dcterms:conformsTo` marker is never removed — it distinguishes
 * “no IIIF” from “declared but failing”. Validation adds two DQV
 * measurements (`manifests-sampled`, `manifests-validated`) so
 * consumers can tell working manifests apart from broken ones.
 *
 * Per-request timeout for the SPARQL query is configured at the
 * {@link Pipeline} level via `PipelineOptions.timeout`; the manifest
 * dereference timeout is owned by `@lde/iiif-validator`.
 */
export async function iiifStage(
  options: IiifStageOptions = {},
): Promise<Stage> {
  const sampleSize = options.manifestSampleSize ?? DEFAULT_MANIFEST_SAMPLE_SIZE;
  const query = (await readQueryFile(QUERY_FILE)).replaceAll(
    '#limit#',
    String(sampleSize),
  );
  // `deduplicate` collapses the constant subset/conformsTo/entities triples,
  // which the COUNT × sample cross-join repeats once per sampled row.
  const detection = new SparqlConstructExecutor({query, deduplicate: true});
  return new Stage({
    name: 'iiif.rq',
    executors: new IiifValidationExecutor(detection),
  });
}
