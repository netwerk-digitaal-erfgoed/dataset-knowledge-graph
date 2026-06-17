import {DataFactory} from 'n3';
import type {Quad} from '@rdfjs/types';
import {skolemIri} from '@lde/dataset';
import type {ValidityVerdict} from '@lde/distribution-health';
import {failureReasonIri, failureUsageQuads} from './failureUsage.js';

const {namedNode, literal, quad} = DataFactory;

const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const DQV_QUALITY_MEASUREMENT = namedNode(
  'http://www.w3.org/ns/dqv#QualityMeasurement',
);
const DQV_COMPUTED_ON = namedNode('http://www.w3.org/ns/dqv#computedOn');
const DQV_IS_MEASUREMENT_OF = namedNode(
  'http://www.w3.org/ns/dqv#isMeasurementOf',
);
const DQV_VALUE = namedNode('http://www.w3.org/ns/dqv#value');
const PROV_ACTIVITY = namedNode('http://www.w3.org/ns/prov#Activity');
const PROV_WAS_GENERATED_BY = namedNode(
  'http://www.w3.org/ns/prov#wasGeneratedBy',
);
const PROV_WAS_ASSOCIATED_WITH = namedNode(
  'http://www.w3.org/ns/prov#wasAssociatedWith',
);
const PROV_GENERATED_AT_TIME = namedNode(
  'http://www.w3.org/ns/prov#generatedAtTime',
);
const XSD_BOOLEAN = namedNode('http://www.w3.org/2001/XMLSchema#boolean');
const XSD_DATE_TIME = namedNode('http://www.w3.org/2001/XMLSchema#dateTime');

const VALIDITY_METRIC = namedNode(
  'https://def.nde.nl/metric#distribution-rdf-valid',
);
const SOURCE_FINGERPRINT = namedNode(
  'https://def.nde.nl/probe#sourceFingerprint',
);
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

  yield quad(measurement, RDF_TYPE, DQV_QUALITY_MEASUREMENT);
  yield quad(measurement, DQV_COMPUTED_ON, distribution);
  yield quad(measurement, DQV_IS_MEASUREMENT_OF, VALIDITY_METRIC);
  yield quad(
    measurement,
    DQV_VALUE,
    literal(verdict.valid ? 'true' : 'false', XSD_BOOLEAN),
  );
  yield quad(
    measurement,
    PROV_GENERATED_AT_TIME,
    literal(provenance.generatedAt.toISOString(), XSD_DATE_TIME),
  );
  yield quad(measurement, PROV_WAS_GENERATED_BY, activity);
  if (verdict.validatedFingerprint !== null) {
    yield quad(
      measurement,
      SOURCE_FINGERPRINT,
      literal(verdict.validatedFingerprint),
    );
  }

  yield quad(activity, RDF_TYPE, PROV_ACTIVITY);
  yield quad(
    activity,
    PROV_WAS_ASSOCIATED_WITH,
    namedNode(provenance.producer),
  );

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
