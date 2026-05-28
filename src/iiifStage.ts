import {resolve} from 'node:path';
import {Stage, SparqlConstructExecutor, readQueryFile} from '@lde/pipeline';

const QUERY_FILE = resolve('queries/analysis/iiif.rq');

/**
 * Detect IIIF Presentation manifests in a dataset and emit a `void:subset`
 * keyed on `dcterms:conformsTo <http://iiif.io/api/presentation/>` with a
 * `void:entities` count of distinct manifests.
 *
 * Detection mirrors SCHEMA-AP-NDE’s `_:IIIFPresentationManifestShape`: a
 * resource is a IIIF manifest iff its `schema:encodingFormat` literal matches
 * the JSON-LD context-profile pattern for any IIIF Presentation version.
 *
 * Per-request timeout is configured at the {@link Pipeline} level via
 * `PipelineOptions.timeout`.
 */
export async function iiifStage(): Promise<Stage> {
  const query = await readQueryFile(QUERY_FILE);
  return new Stage({
    name: 'iiif.rq',
    executors: new SparqlConstructExecutor({query}),
  });
}
