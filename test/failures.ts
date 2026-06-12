import {DataFactory} from 'n3';
import type {Quad} from '@rdfjs/types';

const {namedNode} = DataFactory;

const PROV_ENTITY = namedNode('http://www.w3.org/ns/prov#entity');
const FAILURE_REASON = namedNode('https://def.nde.nl/failure#reason');

/**
 * The `failure:reason` IRI of the qualified usage whose `prov:entity` is `url`,
 * or `undefined` when no failure usage for `url` was emitted. Inverts
 * {@link failureUsageQuads}; shared by the subject-resolution and IIIF tests so
 * the reader of the failure shape stays in one place.
 */
export function failureReasonFor(
  quads: Quad[],
  url: string,
): string | undefined {
  const usage = quads.find(
    q => q.predicate.equals(PROV_ENTITY) && q.object.equals(namedNode(url)),
  )?.subject;
  if (!usage) return undefined;
  return quads.find(
    q => q.subject.equals(usage) && q.predicate.equals(FAILURE_REASON),
  )?.object.value;
}
