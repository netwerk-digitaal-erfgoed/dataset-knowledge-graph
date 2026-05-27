import {resolve} from 'node:path';
import {Stage, SparqlConstructExecutor, readQueryFile} from '@lde/pipeline';

const QUERY_FILE = resolve('queries/analysis/iiif.rq');

export interface IiifStageOptions {
  /**
   * SPARQL query timeout in milliseconds.
   * @default 60_000
   */
  timeout?: number;
}

/**
 * Detect IIIF Presentation manifests in a dataset and emit a `void:subset`
 * keyed on `dcterms:conformsTo <http://iiif.io/api/presentation/>` with a
 * `void:entities` count of distinct manifests.
 *
 * Detection mirrors SCHEMA-AP-NDE’s `_:IIIFPresentationManifestShape`: a
 * resource is a IIIF manifest iff its `schema:encodingFormat` literal matches
 * the JSON-LD context-profile pattern for any IIIF Presentation version.
 */
export async function iiifStage(
  options: IiifStageOptions = {},
): Promise<Stage> {
  const query = await readQueryFile(QUERY_FILE);
  return new Stage({
    name: 'iiif.rq',
    executors: new SparqlConstructExecutor({
      query,
      timeout: options.timeout ?? 60_000,
    }),
  });
}
