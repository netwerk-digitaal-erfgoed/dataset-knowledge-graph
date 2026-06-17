/**
 * A per-dataset named-graph scheme for DKG-generated output.
 *
 * One graph per dataset; the dataset IRI is URL-encoded as the final path
 * segment of `base`, so any slashes/fragments in the dataset IRI cannot collide
 * with the graph IRI hierarchy. The `dkg/` segment in `base` keeps
 * DKG-generated graphs clearly separate from publisher-owned data on the same
 * host (e.g. /NMVW/, /Rijksmuseum/).
 *
 * `prefix()` is the shared IRI prefix of every graph in the scheme; store
 * reconciliation uses it both to recognise the scheme’s graphs and to recover
 * the dataset IRI encoded in their final path segment.
 */
export interface GraphIriScheme {
  graphIri(datasetIri: URL): URL;
  prefix(): string;
}

export function graphIriScheme(base: string): GraphIriScheme {
  return {
    graphIri: datasetIri =>
      new URL(base + encodeURIComponent(datasetIri.toString())),
    prefix: () => base,
  };
}
