import {getCatalog} from '@netwerk-digitaal-erfgoed/network-of-terms-catalog';
import type {Quad} from '@rdfjs/types';
import {DataFactory} from 'n3';

const {namedNode, literal, quad} = DataFactory;
const DCT_TITLE = namedNode('http://purl.org/dc/terms/title');

/**
 * Build a URI-space map from the Network of Terms catalog.
 *
 * Keys are term URI prefixes (e.g. "http://data.rkd.nl/artists/"),
 * values are dct:title quads with multilingual names for each terminology source.
 */
export async function buildUriSpacesMap(): Promise<
  ReadonlyMap<string, readonly Quad[]>
> {
  const catalog = await getCatalog();
  const uriSpaces = new Map<string, readonly Quad[]>();

  for (const dataset of catalog.datasets) {
    const nameQuads: Quad[] = Object.entries(dataset.name).map(([lang, name]) =>
      quad(namedNode(dataset.iri), DCT_TITLE, literal(name, lang)),
    );

    for (const prefix of dataset.termsPrefixes) {
      uriSpaces.set(prefix, nameQuads);
    }
  }

  return uriSpaces;
}
