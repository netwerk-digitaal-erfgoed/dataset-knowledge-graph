/**
 * Where DKG-generated SHACL validation reports live in the output store.
 *
 * One graph per dataset; the dataset IRI is URL-encoded as the final path
 * segment so any slashes/fragments in the dataset IRI cannot collide with the
 * graph IRI hierarchy. The `dkg/` segment keeps DKG-generated graphs clearly
 * separate from publisher-owned data on the same host (e.g. /NMVW/, /Rijksmuseum/).
 *
 * Used as the `graphIri` callback on the n-quads {@link FileWriter} configured
 * as a `reportWriter` on {@link ShaclValidator}.
 */
const VALIDATION_GRAPH_BASE =
  'https://data.netwerkdigitaalerfgoed.nl/dkg/shacl-validation/';

export function validationGraphIri(datasetIri: URL): URL {
  return new URL(
    VALIDATION_GRAPH_BASE + encodeURIComponent(datasetIri.toString()),
  );
}

/**
 * The shared IRI prefix of all validation graphs. Store reconciliation uses it
 * both to recognise DKG-owned validation graphs and to recover the dataset IRI
 * encoded in their final path segment.
 */
export function validationGraphPrefix(): string {
  return VALIDATION_GRAPH_BASE;
}
