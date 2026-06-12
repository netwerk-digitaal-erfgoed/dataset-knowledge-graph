import {DataFactory} from 'n3';
import type {BlankNode, NamedNode, Quad} from '@rdfjs/types';

const {namedNode, quad} = DataFactory;

const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const PROV_USED = namedNode('http://www.w3.org/ns/prov#used');
const PROV_QUALIFIED_USAGE = namedNode(
  'http://www.w3.org/ns/prov#qualifiedUsage',
);
const PROV_USAGE = namedNode('http://www.w3.org/ns/prov#Usage');
const PROV_ENTITY = namedNode('http://www.w3.org/ns/prov#entity');

/** Predicate naming why a sampled resource failed; see the `failure` module. */
const FAILURE_REASON = namedNode('https://def.nde.nl/failure#reason');

/** A sampled resource that failed, paired with its typed failure reason. */
export interface SampleFailure {
  /** The failed resource’s URI/URL. */
  url: string;
  /** SKOS concept naming why it failed (the value of `failure:reason`). */
  reasonIri: NamedNode;
}

/**
 * Emit the PROV qualified-usage shape recording per-sample failures on an
 * existing sampling/validation `prov:Activity`. For every failed sample the
 * activity `prov:used` the resource and `prov:qualifiedUsage` a `prov:Usage`
 * that carries `prov:entity` (the failed URI/URL) and a single
 * `failure:reason` (a SKOS concept). Successful samples are not enumerated, so
 * the presence of a `failure:reason` is the contract for “this sample failed”.
 *
 * The `prov:Usage` is owned by the activity, never by the VoID subset, because
 * a usage reifies an activity-uses-entity relationship. Consumers still reach
 * failures dataset-first via the existing forward path
 * `subset → dqv:hasQualityMeasurement → measurement → prov:wasGeneratedBy →
 * activity → prov:qualifiedUsage → usage`.
 *
 * Shared by the subject-URI resolution transform and the IIIF validation
 * executor so the failure shape lives in exactly one place. Emits nothing for
 * an empty failure list.
 */
export function* failureUsageQuads(
  activity: BlankNode,
  failures: readonly SampleFailure[],
): Generator<Quad> {
  for (const {url, reasonIri} of failures) {
    const entity = namedNode(url);
    const usage = DataFactory.blankNode();

    // `prov:used` accompanies each qualified usage, per PROV convention; the
    // used-set lists only the failed resources, which PROV permits.
    yield quad(activity, PROV_USED, entity);
    yield quad(activity, PROV_QUALIFIED_USAGE, usage);

    yield quad(usage, RDF_TYPE, PROV_USAGE);
    yield quad(usage, PROV_ENTITY, entity);
    yield quad(usage, FAILURE_REASON, reasonIri);
  }
}
