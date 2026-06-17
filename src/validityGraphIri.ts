/**
 * Where DKG-generated RDF-validity verdicts live in the output store.
 *
 * One graph per dataset; the dataset IRI is URL-encoded as the final path
 * segment so any slashes/fragments in the dataset IRI cannot collide with the
 * graph IRI hierarchy. The `dkg/` segment keeps DKG-generated graphs clearly
 * separate from publisher-owned data on the same host (e.g. /NMVW/, /Rijksmuseum/).
 *
 * Kept in its own graph — rather than the dataset’s summary graph — because the
 * verdict carries report-grade diagnostic detail (the typed `failure:reason` and
 * the parser `failure:message`), mirroring how the SHACL validation reports are
 * segregated from the dataset summary. For a distribution whose RDF failed to
 * import, this graph holds the only DKG output the dataset has.
 *
 * Used as the `graphIri` callback on the n-quads {@link FileWriter} the post-run
 * validity pass writes through.
 */
const VALIDITY_GRAPH_BASE =
  'https://data.netwerkdigitaalerfgoed.nl/dkg/distribution-validity/';

export function validityGraphIri(datasetIri: URL): URL {
  return new URL(
    VALIDITY_GRAPH_BASE + encodeURIComponent(datasetIri.toString()),
  );
}

/**
 * The shared IRI prefix of all validity graphs. Store reconciliation uses it
 * both to recognise DKG-owned validity graphs and to recover the dataset IRI
 * encoded in their final path segment.
 */
export function validityGraphPrefix(): string {
  return VALIDITY_GRAPH_BASE;
}
