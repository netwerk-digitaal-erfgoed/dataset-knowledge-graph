import {DataFactory} from 'n3';
import type {NamedNode, Quad} from '@rdfjs/types';
import {prov, rdf} from '@tpluscode/rdf-ns-builders';
import {hashSuffix, skolemIri} from '@lde/dataset';
import {failure} from './namespaces.js';

const {namedNode, quad} = DataFactory;

/**
 * Build a failure-reason concept IRI from its scheme base and the reason’s
 * local name — the `<scheme-base><reason>` convention shared by every failure
 * concept scheme. Callers keep their own typed base constant and reason union;
 * the naming convention lives here, next to the shape it labels.
 */
export function failureReasonIri(
  schemeBase: string,
  reason: string,
): NamedNode {
  return namedNode(`${schemeBase}${reason}`);
}

/** A sampled resource that failed, paired with its typed failure reason. */
export interface SampleFailure {
  /** The failed resource’s URI/URL. */
  url: string;
  /** SKOS concept naming why it failed (the value of `failure:reason`). */
  reasonIri: NamedNode;
  /**
   * Optional best-effort free-text diagnostic (the value of `failure:message`),
   * for example a parser error. Omitted when none is available.
   */
  message?: string;
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
 * The `activity` must be a skolem IRI (see `skolemIri` in `@lde/dataset`), and
 * each usage is derived from it keyed on the failed URL. Usages are IRIs, not
 * blank nodes, so usages from different stages cannot collide when their output
 * is merged into the dataset’s graph (see issue #352).
 *
 * Shared by the subject-URI resolution transform and the IIIF validation
 * executor so the failure shape lives in exactly one place. Emits nothing for
 * an empty failure list.
 */
export function* failureUsageQuads(
  activity: NamedNode,
  failures: readonly SampleFailure[],
): Generator<Quad> {
  for (const {url, reasonIri, message} of failures) {
    const entity = namedNode(url);
    const usage = namedNode(
      skolemIri(activity.value, 'usage', hashSuffix(url)),
    );

    // `prov:used` accompanies each qualified usage, per PROV convention; the
    // used-set lists only the failed resources, which PROV permits.
    yield quad(activity, prov.used, entity);
    yield quad(activity, prov.qualifiedUsage, usage);

    yield quad(usage, rdf.type, prov.Usage);
    yield quad(usage, prov.entity, entity);
    yield quad(usage, failure.reason, reasonIri);
    if (message !== undefined) {
      yield quad(usage, failure.message, DataFactory.literal(message));
    }
  }
}
