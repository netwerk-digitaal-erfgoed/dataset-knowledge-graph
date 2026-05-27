import {Dataset} from '@lde/dataset';
import type {Quad} from '@rdfjs/types';
import type {Writer} from '@lde/pipeline';

/**
 * Where DKG-generated SHACL validation reports live in the triplestore.
 *
 * One graph per dataset; the dataset IRI is URL-encoded as the final path
 * segment so any slashes/fragments in the dataset IRI cannot collide with the
 * graph IRI hierarchy. The `dkg/` segment keeps DKG-generated graphs clearly
 * separate from publisher-owned data on the same host (e.g. /NMVW/, /Rijksmuseum/).
 */
const VALIDATION_GRAPH_BASE =
  'https://data.netwerkdigitaalerfgoed.nl/dkg/shacl-validation/';

export function validationGraphIri(datasetIri: URL): URL {
  return new URL(
    VALIDATION_GRAPH_BASE + encodeURIComponent(datasetIri.toString()),
  );
}

/**
 * Wraps a {@link Writer} (typically a {@link SparqlUpdateWriter}) so it sees
 * a per-dataset *validation* graph IRI instead of the dataset's own IRI.
 *
 * Used as a `reportWriter` on {@link ShaclValidator} so SHACL validation
 * reports land in a dedicated graph rather than mixing into the dataset
 * graph (which would risk CLEAR GRAPH wiping publisher data on re-validation).
 */
export class ValidationGraphWriter implements Writer {
  public constructor(private readonly inner: Writer) {}

  public write(dataset: Dataset, quads: AsyncIterable<Quad>): Promise<void> {
    return this.inner.write(this.wrap(dataset), quads);
  }

  public async flush(dataset: Dataset): Promise<void> {
    await this.inner.flush?.(this.wrap(dataset));
  }

  private wrap(dataset: Dataset): Dataset {
    return new Dataset({
      iri: validationGraphIri(dataset.iri),
      title: dataset.title,
      description: dataset.description,
      language: dataset.language,
      license: dataset.license,
      distributions: dataset.distributions,
      creator: dataset.creator,
      publisher: dataset.publisher,
    });
  }
}
