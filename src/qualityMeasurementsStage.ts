import {DataFactory} from 'n3';
import type {Quad} from '@rdfjs/types';
import {dcterms, dqv, prov, rdf, xsd} from '@tpluscode/rdf-ns-builders';
import type {Dataset} from '@lde/dataset';
import {Stage, type Executor, type Validator} from '@lde/pipeline';
import {metric} from './namespaces.js';

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
        quad(activity, rdf.type, prov.Activity),
        quad(activity, prov.used, subject),
        quad(activity, prov.used, profile),
        quad(activity, prov.wasAssociatedWith, validatorSoftware),

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
        quad(quadsValidatedMeasurement, rdf.type, dqv.QualityMeasurement),
        quad(quadsValidatedMeasurement, dqv.computedOn, subject),
        quad(
          quadsValidatedMeasurement,
          dqv.isMeasurementOf,
          metric['quads-validated'],
        ),
        quad(
          quadsValidatedMeasurement,
          dqv.value,
          literal(String(report.quadsValidated), xsd.integer),
        ),
        quad(quadsValidatedMeasurement, prov.wasGeneratedBy, activity),

        // Coverage: configured sample cap per target class.
        quad(samplesPerClassMeasurement, rdf.type, dqv.QualityMeasurement),
        quad(samplesPerClassMeasurement, dqv.computedOn, subject),
        quad(
          samplesPerClassMeasurement,
          dqv.isMeasurementOf,
          metric['samples-per-class'],
        ),
        quad(
          samplesPerClassMeasurement,
          dqv.value,
          literal(String(options.samplesPerClass), xsd.integer),
        ),
        quad(samplesPerClassMeasurement, prov.wasGeneratedBy, activity),
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
