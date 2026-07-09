import {DataFactory} from 'n3';
import pLimit from 'p-limit';
import type {NamedNode, Quad} from '@rdfjs/types';
import {skolemIri, type Dataset, type Distribution} from '@lde/dataset';
import {NotSupported, type Reader, type ReadOptions} from '@lde/pipeline';
import {
  validateManifest,
  type ManifestValidation,
  type ManifestValidationReason,
} from '@lde/iiif-validator';
import {dqv} from '@tpluscode/rdf-ns-builders';
import {
  failureReasonIri,
  failureUsageQuads,
  type SampleFailure,
} from './failureUsage.js';
import {metric} from './namespaces.js';
import {integerMeasurement, provActivity} from './measurements.js';

const {namedNode, quad} = DataFactory;

const IIIF_PRESENTATION = namedNode('http://iiif.io/api/presentation/');

/**
 * Predicate of the intermediate triple emitted by `iiif.rq` carrying a sampled
 * manifest IRI. Consumed and stripped here; never reaches output. Must match
 * the IRI hard-coded in `queries/analysis/iiif.rq`.
 */
const MANIFEST_SAMPLE = namedNode('https://def.nde.nl/iiif#manifest-sample');

const MANIFEST_VALIDATION_FAILURE_BASE =
  'https://def.nde.nl/manifest-validation-failure#';

/**
 * A non-success {@link ManifestValidationReason} — a manifest failure reason.
 * Excludes the validator’s `valid-manifest` success value, the one reason with
 * no failure concept.
 */
export type ManifestValidationFailureReason = Exclude<
  ManifestValidationReason,
  'valid-manifest'
>;

/**
 * Lockstep guard between the `@lde/iiif-validator` reason enum and the
 * published `manifest-validation-failure` concept scheme. Keying a `Record` on
 * every failure reason forces an entry per reason, so a new validator reason
 * fails the TypeScript build here rather than silently emitting a
 * `manifest-validation-failure#` term the vocabulary never defined. The concept
 * local names equal the enum strings, so the IRI is a plain concatenation with
 * no lookup table to drift.
 */
export const MANIFEST_VALIDATION_FAILURE_REASONS: Record<
  ManifestValidationFailureReason,
  true
> = {
  timeout: true,
  'network-error': true,
  'http-error': true,
  'invalid-json': true,
  'binary-content': true,
  'not-a-manifest': true,
  'does-not-load': true,
};

/** Map a manifest failure reason to its `manifest-validation-failure#` IRI. */
export function manifestValidationFailureIri(
  reason: ManifestValidationFailureReason,
) {
  return failureReasonIri(MANIFEST_VALIDATION_FAILURE_BASE, reason);
}

/**
 * The in-scheme failure reason for a non-valid verdict. A rejected validator
 * (its contract says this never happens) and the contract-violating
 * `valid: false` paired with the `valid-manifest` success reason both fall back
 * to `network-error`, so the emitted `failure:reason` is never an undefined
 * `manifest-validation-failure#` term. Narrowing out `valid-manifest` lets the
 * return type check without a cast.
 */
function failureReason(
  verdict: PromiseSettledResult<ManifestValidation>,
): ManifestValidationFailureReason {
  if (verdict.status !== 'fulfilled') return 'network-error';
  const {reason} = verdict.value;
  return reason === 'valid-manifest' ? 'network-error' : reason;
}

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

export interface IiifValidationReaderOptions {
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
 * Reader decorator that turns *declared* IIIF conformance into *validated*
 * conformance. It wraps the detection {@link Reader}: the VoID `void:subset`,
 * `dcterms:conformsTo`, and `void:entities` quads pass through unchanged (the
 * declared marker is never removed), the intermediate manifest-sample triples
 * are stripped, and the sampled manifest URIs are dereferenced via
 * `@lde/iiif-validator`. The outcome is appended as two DQV integer
 * measurements (`manifests-sampled`, `manifests-validated`) plus a
 * PROV activity, mirroring {@link qualityMeasurementsStage}. Consumers derive
 * `k / N` and pick their own trust threshold; the only non-arbitrary cut is
 * `validated = 0` (failing) versus `validated > 0` (working).
 */
export class IiifValidationReader implements Reader {
  private readonly validate: ValidateManifest;
  private readonly concurrency: number;
  private readonly validatorSoftware;

  constructor(
    private readonly inner: Reader,
    options: IiifValidationReaderOptions = {},
  ) {
    this.validate = options.validate ?? (url => validateManifest(url));
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.validatorSoftware = options.validatorSoftware
      ? namedNode(options.validatorSoftware)
      : DEFAULT_VALIDATOR_SOFTWARE;
  }

  async read(
    dataset: Dataset,
    distribution: Distribution,
    options?: ReadOptions,
  ): Promise<AsyncIterable<Quad> | NotSupported> {
    const result = await this.inner.read(dataset, distribution, options);
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
    // The manifest-sample triples are all subjects of the IIIF capability
    // subset; capture that IRI so the measurements are computed on the subset
    // they actually describe, not the whole dataset.
    let iiifSubset: string | undefined;
    for await (const q of quads) {
      if (q.predicate.equals(MANIFEST_SAMPLE)) {
        sampledManifests.push(q.object.value);
        iiifSubset = q.subject.value;
        continue;
      }
      yield q;
    }

    // No IIIF subset detected: emit nothing extra (state 1, “no IIIF”).
    if (sampledManifests.length === 0 || iiifSubset === undefined) {
      return;
    }

    const limit = pLimit(this.concurrency);
    const verdicts = await Promise.allSettled(
      sampledManifests.map(url => limit(() => this.validate(url))),
    );

    // Pair each sampled manifest with its verdict: a valid manifest counts
    // towards `validated`, every other outcome becomes a persisted failure
    // carrying the validator’s reason (see {@link failureReason}).
    let validated = 0;
    const failures: SampleFailure[] = [];
    sampledManifests.forEach((url, index) => {
      const verdict = verdicts[index];
      if (verdict.status === 'fulfilled' && verdict.value.valid) {
        validated++;
        return;
      }
      failures.push({
        url,
        reasonIri: manifestValidationFailureIri(failureReason(verdict)),
      });
    });

    yield* this.measurementQuads(
      dataset,
      namedNode(iiifSubset),
      sampledManifests.length,
      validated,
      failures,
    );
  }

  private *measurementQuads(
    dataset: Dataset,
    iiifSubset: NamedNode,
    sampled: number,
    validated: number,
    failures: readonly SampleFailure[],
  ): Generator<Quad> {
    // Every structural node is a skolem IRI derived from the (unique) IIIF
    // subset, not a blank node, so it cannot collide with another stage’s nodes
    // when merged into the dataset graph (see issue #352).
    const activity = namedNode(
      skolemIri(iiifSubset.value, 'validation-activity'),
    );
    const sampledMeasurement = namedNode(
      skolemIri(iiifSubset.value, 'measurement', 'manifests-sampled'),
    );
    const validatedMeasurement = namedNode(
      skolemIri(iiifSubset.value, 'measurement', 'manifests-validated'),
    );

    // PROV: the dereferencing activity, with a qualified usage per failed
    // manifest naming the URL and why validation failed.
    yield* provActivity(
      activity,
      [namedNode(dataset.iri.toString()), IIIF_PRESENTATION],
      this.validatorSoftware,
    );
    yield* failureUsageQuads(activity, failures);

    // The measurements describe the IIIF capability subset, which already
    // carries `dcterms:conformsTo <iiif-presentation>` — so they hang off the
    // subset and `dqv:computedOn` it, dropping the per-measurement conformsTo
    // back-link the dataset-level modelling needed.
    yield quad(iiifSubset, dqv.hasQualityMeasurement, sampledMeasurement);
    yield quad(iiifSubset, dqv.hasQualityMeasurement, validatedMeasurement);

    yield* integerMeasurement(
      sampledMeasurement,
      iiifSubset,
      metric['manifests-sampled'],
      sampled,
      activity,
    );
    yield* integerMeasurement(
      validatedMeasurement,
      iiifSubset,
      metric['manifests-validated'],
      validated,
      activity,
    );
  }
}
