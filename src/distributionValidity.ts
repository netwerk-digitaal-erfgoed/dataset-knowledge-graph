import {DataFactory} from 'n3';
import {dqv, prov, rdf, xsd} from '@tpluscode/rdf-ns-builders';
import type {Quad} from '@rdfjs/types';
import {skolemIri} from '@lde/dataset';
import type {ValidityVerdict} from '@lde/distribution-health';
import {failureReasonIri, failureUsageQuads} from './failureUsage.js';
import {metric, probe} from './namespaces.js';

const {namedNode, literal, quad} = DataFactory;

const VALIDITY_METRIC = metric['distribution-rdf-valid'];
const VALIDITY_FAILURE_SCHEME =
  'https://def.nde.nl/distribution-validity-failure#';

/** Provenance context stamped onto a verdict’s quads. */
export interface ValidityProvenance {
  /** The distribution’s access URL – the subject the verdict is about. */
  distributionUrl: string;
  /** When the verdict was produced. */
  generatedAt: Date;
  /** IRI of the software that produced the verdict (producer attribution). */
  producer: string;
}

/**
 * Map an RDF-validity {@link ValidityVerdict} to `def.nde.nl` DQV/PROV quads: a
 * `dqv:QualityMeasurement` of `metric:distribution-rdf-valid`, computed on the
 * distribution itself, stamped with the producer, the time, and the
 * `probe:sourceFingerprint` it was judged against. An invalid verdict adds the
 * PROV qualified-usage failure shape (`failure:reason` + optional
 * `failure:message`) via the shared {@link failureUsageQuads}.
 */
export function* distributionValidityQuads(
  verdict: ValidityVerdict,
  provenance: ValidityProvenance,
): Iterable<Quad> {
  const distribution = namedNode(provenance.distributionUrl);
  // Every structural node is a skolem IRI derived from the (unique) distribution
  // it describes, not a blank node, so distinct distributions’ nodes cannot
  // collide and a re-run is idempotent (see issue #352).
  const measurement = namedNode(
    skolemIri(distribution.value, 'measurement', 'distribution-rdf-valid'),
  );
  const activity = namedNode(
    skolemIri(distribution.value, 'validity-activity'),
  );

  yield quad(measurement, rdf.type, dqv.QualityMeasurement);
  yield quad(measurement, dqv.computedOn, distribution);
  yield quad(measurement, dqv.isMeasurementOf, VALIDITY_METRIC);
  yield quad(
    measurement,
    dqv.value,
    literal(verdict.valid ? 'true' : 'false', xsd.boolean),
  );
  yield quad(
    measurement,
    prov.generatedAtTime,
    literal(provenance.generatedAt.toISOString(), xsd.dateTime),
  );
  yield quad(measurement, prov.wasGeneratedBy, activity);
  if (verdict.validatedFingerprint !== null) {
    yield quad(
      measurement,
      probe.sourceFingerprint,
      literal(verdict.validatedFingerprint),
    );
  }

  yield quad(activity, rdf.type, prov.Activity);
  yield quad(activity, prov.wasAssociatedWith, namedNode(provenance.producer));

  if (!verdict.valid && verdict.reason !== undefined) {
    yield* failureUsageQuads(activity, [
      {
        url: provenance.distributionUrl,
        reasonIri: failureReasonIri(VALIDITY_FAILURE_SCHEME, verdict.reason),
        message: verdict.message,
      },
    ]);
  }
}
