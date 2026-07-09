import {DataFactory} from 'n3';
import type {Quad} from '@rdfjs/types';
import {dcterms, dqv, prov, rdf, xsd} from '@tpluscode/rdf-ns-builders';
import type {Dataset} from '@lde/dataset';
import {Stage, type Reader, type Validator} from '@lde/pipeline';
import {metric} from './namespaces.js';
import {integerMeasurement, provActivity} from './measurements.js';

const {namedNode, literal, blankNode, quad} = DataFactory;

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

  const reader: Reader = {
    async read(dataset: Dataset) {
      const report = await options.validator.report(dataset);
      const subject = namedNode(dataset.iri.toString());

      const activity = blankNode();
      const conformanceMeasurement = blankNode();
      const quadsValidatedMeasurement = blankNode();
      const samplesPerClassMeasurement = blankNode();

      const quads: Quad[] = [
        // PROV: validation activity.
        ...provActivity(activity, [subject, profile], validatorSoftware),

        // Dataset → measurements.
        quad(subject, dqv.hasQualityMeasurement, conformanceMeasurement),
        quad(subject, dqv.hasQualityMeasurement, quadsValidatedMeasurement),
        quad(subject, dqv.hasQualityMeasurement, samplesPerClassMeasurement),

        // Conformance measurement — also carries dcterms:conformsTo so the
        // DQV navigation path reaches the profile without leaving DQV.
        quad(conformanceMeasurement, rdf.type, dqv.QualityMeasurement),
        quad(conformanceMeasurement, dqv.computedOn, subject),
        quad(
          conformanceMeasurement,
          dqv.isMeasurementOf,
          metric['schema-ap-nde-sample-conformance'],
        ),
        quad(
          conformanceMeasurement,
          dqv.value,
          literal(report.conforms ? 'true' : 'false', xsd.boolean),
        ),
        quad(conformanceMeasurement, dcterms.conformsTo, profile),
        quad(conformanceMeasurement, prov.wasGeneratedBy, activity),

        // Coverage: number of quads the validator inspected.
        ...integerMeasurement(
          quadsValidatedMeasurement,
          subject,
          metric['quads-validated'],
          report.quadsValidated,
          activity,
        ),

        // Coverage: configured sample cap per target class.
        ...integerMeasurement(
          samplesPerClassMeasurement,
          subject,
          metric['samples-per-class'],
          options.samplesPerClass,
          activity,
        ),
      ];

      return (async function* () {
        for (const q of quads) yield q;
      })();
    },
  };

  return new Stage({
    name: 'schema-ap-nde-quality-measurements',
    readers: reader,
  });
}
