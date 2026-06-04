import {DataFactory} from 'n3';
import pLimit from 'p-limit';
import type {Quad} from '@rdfjs/types';
import type {Dataset, Distribution} from '@lde/dataset';
import {NotSupported, type Executor, type ExecuteOptions} from '@lde/pipeline';
import {validateManifest, type ManifestValidation} from '@lde/iiif-validator';

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
const XSD_INTEGER = namedNode('http://www.w3.org/2001/XMLSchema#integer');
const IIIF_PRESENTATION = namedNode('http://iiif.io/api/presentation/');

const METRIC_BASE = 'https://def.nde.nl/metric#';
const MANIFESTS_SAMPLED_METRIC = namedNode(`${METRIC_BASE}manifests-sampled`);
const MANIFESTS_VALIDATED_METRIC = namedNode(
  `${METRIC_BASE}manifests-validated`,
);

/**
 * Predicate of the intermediate triple emitted by `iiif.rq` carrying a sampled
 * manifest IRI. Consumed and stripped here; never reaches output. Must match
 * the IRI hard-coded in `queries/analysis/iiif.rq`.
 */
const MANIFEST_SAMPLE = namedNode('https://def.nde.nl/iiif#manifest-sample');

const DEFAULT_VALIDATOR_SOFTWARE = namedNode(
  'https://www.npmjs.com/package/@lde/iiif-validator',
);

/**
 * Default in-flight dereference cap. Kept low because the sampled manifests
 * typically share a single heritage host that we must not overload.
 */
const DEFAULT_CONCURRENCY = 4;

/** Validates a single manifest URL and reports the verdict. */
export type ValidateManifest = (url: string) => Promise<ManifestValidation>;

export interface IiifValidationExecutorOptions {
  /**
   * Manifest validator. Injectable for testing; defaults to dereferencing via
   * `@lde/iiif-validator`.
   */
  validate?: ValidateManifest;
  /** Maximum concurrent dereferences. Defaults to 4. */
  concurrency?: number;
  /**
   * IRI identifying the validator software for the `prov:wasAssociatedWith`
   * link. Defaults to the npm page for `@lde/iiif-validator`.
   */
  validatorSoftware?: string;
}

/**
 * Executor decorator that turns *declared* IIIF conformance into *validated*
 * conformance. It wraps the detection {@link Executor}: the VoID `void:subset`,
 * `dcterms:conformsTo`, and `void:entities` quads pass through unchanged (the
 * declared marker is never removed), the intermediate manifest-sample triples
 * are stripped, and the sampled manifest URIs are dereferenced via
 * `@lde/iiif-validator`. The outcome is appended as two DQV integer
 * measurements (`manifests-sampled`, `manifests-validated`) plus a
 * PROV activity, mirroring {@link qualityMeasurementsStage}. Consumers derive
 * `k / N` and pick their own trust threshold; the only non-arbitrary cut is
 * `validated = 0` (failing) versus `validated > 0` (working).
 */
export class IiifValidationExecutor implements Executor {
  private readonly validate: ValidateManifest;
  private readonly concurrency: number;
  private readonly validatorSoftware;

  constructor(
    private readonly inner: Executor,
    options: IiifValidationExecutorOptions = {},
  ) {
    this.validate = options.validate ?? (url => validateManifest(url));
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.validatorSoftware = options.validatorSoftware
      ? namedNode(options.validatorSoftware)
      : DEFAULT_VALIDATOR_SOFTWARE;
  }

  async execute(
    dataset: Dataset,
    distribution: Distribution,
    options?: ExecuteOptions,
  ): Promise<AsyncIterable<Quad> | NotSupported> {
    const result = await this.inner.execute(dataset, distribution, options);
    if (result instanceof NotSupported) {
      return result;
    }
    return this.withValidation(result, dataset);
  }

  /**
   * Pass the inner VoID quads through unchanged while intercepting the
   * intermediate manifest-sample triples; after the inner stream is exhausted,
   * dereference the sampled URIs and append the measurement quads.
   */
  private async *withValidation(
    quads: AsyncIterable<Quad>,
    dataset: Dataset,
  ): AsyncIterable<Quad> {
    const sampledManifests: string[] = [];
    for await (const q of quads) {
      if (q.predicate.equals(MANIFEST_SAMPLE)) {
        sampledManifests.push(q.object.value);
        continue;
      }
      yield q;
    }

    // No IIIF subset detected: emit nothing extra (state 1, “no IIIF”).
    if (sampledManifests.length === 0) {
      return;
    }

    const limit = pLimit(this.concurrency);
    const verdicts = await Promise.allSettled(
      sampledManifests.map(url => limit(() => this.validate(url))),
    );
    const validated = verdicts.filter(
      verdict => verdict.status === 'fulfilled' && verdict.value.valid,
    ).length;

    yield* this.measurementQuads(dataset, sampledManifests.length, validated);
  }

  private *measurementQuads(
    dataset: Dataset,
    sampled: number,
    validated: number,
  ): Generator<Quad> {
    const subject = namedNode(dataset.iri.toString());
    const activity = blankNode();
    const sampledMeasurement = blankNode();
    const validatedMeasurement = blankNode();

    // PROV: the dereferencing activity.
    yield quad(activity, RDF_TYPE, PROV_ACTIVITY);
    yield quad(activity, PROV_USED, subject);
    yield quad(activity, PROV_USED, IIIF_PRESENTATION);
    yield quad(activity, PROV_WAS_ASSOCIATED_WITH, this.validatorSoftware);

    yield quad(subject, DQV_HAS_QUALITY_MEASUREMENT, sampledMeasurement);
    yield quad(subject, DQV_HAS_QUALITY_MEASUREMENT, validatedMeasurement);

    yield* this.integerMeasurement(
      sampledMeasurement,
      subject,
      MANIFESTS_SAMPLED_METRIC,
      sampled,
      activity,
    );
    yield* this.integerMeasurement(
      validatedMeasurement,
      subject,
      MANIFESTS_VALIDATED_METRIC,
      validated,
      activity,
    );
  }

  private *integerMeasurement(
    measurement: ReturnType<typeof blankNode>,
    subject: ReturnType<typeof namedNode>,
    metric: ReturnType<typeof namedNode>,
    value: number,
    activity: ReturnType<typeof blankNode>,
  ): Generator<Quad> {
    yield quad(measurement, RDF_TYPE, DQV_QUALITY_MEASUREMENT);
    yield quad(measurement, DQV_COMPUTED_ON, subject);
    yield quad(measurement, DQV_IS_MEASUREMENT_OF, metric);
    yield quad(measurement, DQV_VALUE, literal(String(value), XSD_INTEGER));
    // Carry the IIIF profile so the DQV navigation path reaches what was
    // validated without leaving DQV (mirrors the conformance measurement).
    yield quad(measurement, DCTERMS_CONFORMS_TO, IIIF_PRESENTATION);
    yield quad(measurement, PROV_WAS_GENERATED_BY, activity);
  }
}
