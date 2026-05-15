import {DataFactory} from 'n3';
import type {Quad} from '@rdfjs/types';
import type {Dataset} from '@lde/dataset';
import {Stage, type Executor, type Validator} from '@lde/pipeline';

const {namedNode, literal, blankNode, quad} = DataFactory;

const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const DQV_HAS_QUALITY_MEASUREMENT = namedNode(
  'http://www.w3.org/ns/dqv#hasQualityMeasurement',
);
const DQV_QUALITY_MEASUREMENT = namedNode(
  'http://www.w3.org/ns/dqv#QualityMeasurement',
);
const DQV_COMPUTED_ON = namedNode('http://www.w3.org/ns/dqv#computedOn');
const DQV_IS_MEASUREMENT_OF = namedNode(
  'http://www.w3.org/ns/dqv#isMeasurementOf',
);
const DQV_VALUE = namedNode('http://www.w3.org/ns/dqv#value');
const DCTERMS_CONFORMS_TO = namedNode('http://purl.org/dc/terms/conformsTo');
const PROV_ACTIVITY = namedNode('http://www.w3.org/ns/prov#Activity');
const PROV_USED = namedNode('http://www.w3.org/ns/prov#used');
const PROV_WAS_ASSOCIATED_WITH = namedNode(
  'http://www.w3.org/ns/prov#wasAssociatedWith',
);
const PROV_WAS_GENERATED_BY = namedNode(
  'http://www.w3.org/ns/prov#wasGeneratedBy',
);
const XSD_BOOLEAN = namedNode('http://www.w3.org/2001/XMLSchema#boolean');
const XSD_INTEGER = namedNode('http://www.w3.org/2001/XMLSchema#integer');

const METRIC_BASE = 'https://data.netwerkdigitaalerfgoed.nl/def/metric/';
const CONFORMANCE_METRIC = namedNode(
  `${METRIC_BASE}schema-ap-nde-sample-conformance`,
);
const QUADS_VALIDATED_METRIC = namedNode(`${METRIC_BASE}quads-validated`);
const SAMPLES_PER_CLASS_METRIC = namedNode(`${METRIC_BASE}samples-per-class`);

const DEFAULT_VALIDATOR_SOFTWARE = namedNode(
  'https://www.npmjs.com/package/@lde/pipeline-shacl-validator',
);

export interface QualityMeasurementsStageOptions {
  /**
   * Validator whose accumulated per-dataset report is read at stage execution
   * time. The stage trusts the validator’s state at that point — so this
   * stage must be ordered *after* all stages whose output the validator
   * inspects (typically the sampler stages).
   */
  validator: Validator;
  /** IRI of the profile validated against, e.g. SCHEMA-AP-NDE. */
  profile: string;
  /** The `samplesPerClass` configured on the sampler. */
  samplesPerClass: number;
  /**
   * IRI identifying the validator software for the `prov:wasAssociatedWith`
   * link. Defaults to the npm page for `@lde/pipeline-shacl-validator`.
   */
  validatorSoftware?: string;
}

/**
 * Emit DQV quality measurements + a PROV activity describing the SHACL
 * validation outcome, once per dataset, after the sampler stages have run.
 * See the README for the modelling rationale (DQV for measurements, PROV
 * for the validation activity, no `sh:ValidationReport` in the SPARQL store —
 * detailed violations stay in `output/validation/<dataset>.ttl`).
 */
export function qualityMeasurementsStage(
  options: QualityMeasurementsStageOptions,
): Stage {
  const validatorSoftware = options.validatorSoftware
    ? namedNode(options.validatorSoftware)
    : DEFAULT_VALIDATOR_SOFTWARE;
  const profile = namedNode(options.profile);

  const executor: Executor = {
    async execute(dataset: Dataset) {
      const report = await options.validator.report(dataset);
      const subject = namedNode(dataset.iri.toString());

      const activity = blankNode();
      const conformanceMeasurement = blankNode();
      const quadsValidatedMeasurement = blankNode();
      const samplesPerClassMeasurement = blankNode();

      const quads: Quad[] = [
        // PROV: validation activity.
        quad(activity, RDF_TYPE, PROV_ACTIVITY),
        quad(activity, PROV_USED, subject),
        quad(activity, PROV_USED, profile),
        quad(activity, PROV_WAS_ASSOCIATED_WITH, validatorSoftware),

        // Dataset → measurements.
        quad(subject, DQV_HAS_QUALITY_MEASUREMENT, conformanceMeasurement),
        quad(subject, DQV_HAS_QUALITY_MEASUREMENT, quadsValidatedMeasurement),
        quad(subject, DQV_HAS_QUALITY_MEASUREMENT, samplesPerClassMeasurement),

        // Conformance measurement — also carries dcterms:conformsTo so the
        // DQV navigation path reaches the profile without leaving DQV.
        quad(conformanceMeasurement, RDF_TYPE, DQV_QUALITY_MEASUREMENT),
        quad(conformanceMeasurement, DQV_COMPUTED_ON, subject),
        quad(conformanceMeasurement, DQV_IS_MEASUREMENT_OF, CONFORMANCE_METRIC),
        quad(
          conformanceMeasurement,
          DQV_VALUE,
          literal(report.conforms ? 'true' : 'false', XSD_BOOLEAN),
        ),
        quad(conformanceMeasurement, DCTERMS_CONFORMS_TO, profile),
        quad(conformanceMeasurement, PROV_WAS_GENERATED_BY, activity),

        // Coverage: number of quads the validator inspected.
        quad(quadsValidatedMeasurement, RDF_TYPE, DQV_QUALITY_MEASUREMENT),
        quad(quadsValidatedMeasurement, DQV_COMPUTED_ON, subject),
        quad(
          quadsValidatedMeasurement,
          DQV_IS_MEASUREMENT_OF,
          QUADS_VALIDATED_METRIC,
        ),
        quad(
          quadsValidatedMeasurement,
          DQV_VALUE,
          literal(String(report.quadsValidated), XSD_INTEGER),
        ),
        quad(quadsValidatedMeasurement, PROV_WAS_GENERATED_BY, activity),

        // Coverage: configured sample cap per target class.
        quad(samplesPerClassMeasurement, RDF_TYPE, DQV_QUALITY_MEASUREMENT),
        quad(samplesPerClassMeasurement, DQV_COMPUTED_ON, subject),
        quad(
          samplesPerClassMeasurement,
          DQV_IS_MEASUREMENT_OF,
          SAMPLES_PER_CLASS_METRIC,
        ),
        quad(
          samplesPerClassMeasurement,
          DQV_VALUE,
          literal(String(options.samplesPerClass), XSD_INTEGER),
        ),
        quad(samplesPerClassMeasurement, PROV_WAS_GENERATED_BY, activity),
      ];

      return (async function* () {
        for (const q of quads) yield q;
      })();
    },
  };

  return new Stage({
    name: 'schema-ap-nde-quality-measurements',
    executors: executor,
  });
}
