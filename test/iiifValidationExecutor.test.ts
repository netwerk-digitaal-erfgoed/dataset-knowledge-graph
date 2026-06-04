import {describe, it, expect} from 'vitest';
import {DataFactory} from 'n3';
import type {Quad} from '@rdfjs/types';
import {Dataset, Distribution} from '@lde/dataset';
import {NotSupported, type Executor} from '@lde/pipeline';
import {
  IiifValidationExecutor,
  type ValidateManifest,
} from '../src/iiifValidationExecutor.js';

const {namedNode, literal, quad} = DataFactory;

const DATASET_IRI = 'http://example.org/dataset/1';
const SUBSET_IRI = `${DATASET_IRI}/.well-known/void#iiif`;

const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const VOID_DATASET = namedNode('http://rdfs.org/ns/void#Dataset');
const VOID_SUBSET = namedNode('http://rdfs.org/ns/void#subset');
const VOID_ENTITIES = namedNode('http://rdfs.org/ns/void#entities');
const DCTERMS_CONFORMS_TO = namedNode('http://purl.org/dc/terms/conformsTo');
const IIIF_PRESENTATION = namedNode('http://iiif.io/api/presentation/');
const MANIFEST_SAMPLE = namedNode('https://def.nde.nl/iiif#manifest-sample');
const XSD_INTEGER = namedNode('http://www.w3.org/2001/XMLSchema#integer');
const DQV_HAS_QUALITY_MEASUREMENT = namedNode(
  'http://www.w3.org/ns/dqv#hasQualityMeasurement',
);
const DQV_IS_MEASUREMENT_OF = namedNode(
  'http://www.w3.org/ns/dqv#isMeasurementOf',
);
const DQV_VALUE = namedNode('http://www.w3.org/ns/dqv#value');
const DQV_COMPUTED_ON = namedNode('http://www.w3.org/ns/dqv#computedOn');
const METRIC_BASE = 'https://def.nde.nl/metric#';
const MANIFESTS_SAMPLED_METRIC = namedNode(`${METRIC_BASE}manifests-sampled`);
const MANIFESTS_VALIDATED_METRIC = namedNode(
  `${METRIC_BASE}manifests-validated`,
);

/** Find the integer value of the measurement of the given metric. */
function measurementValue(quads: Quad[], metric: string): number | undefined {
  const measurement = quads.find(
    q => q.predicate.equals(DQV_IS_MEASUREMENT_OF) && q.object.value === metric,
  )?.subject;
  if (!measurement) return undefined;
  const value = quads.find(
    q => q.subject.equals(measurement) && q.predicate.equals(DQV_VALUE),
  );
  return value ? Number(value.object.value) : undefined;
}

const dataset = new Dataset({iri: new URL(DATASET_IRI), distributions: []});
const distribution = Distribution.sparql(new URL('http://example.org/sparql'));

/** A fake inner executor that yields a fixed synthetic quad stream. */
function innerYielding(quads: Quad[]): Executor {
  return {
    async execute() {
      return (async function* () {
        for (const q of quads) yield q;
      })();
    },
  };
}

async function collect(
  result: AsyncIterable<Quad> | NotSupported,
): Promise<Quad[]> {
  if (result instanceof NotSupported)
    throw new Error('unexpected NotSupported');
  const quads: Quad[] = [];
  for await (const q of result) quads.push(q);
  return quads;
}

/** The VoID quads the detection query emits for a dataset with IIIF. */
function voidQuads(): Quad[] {
  const dataset = namedNode(DATASET_IRI);
  const subset = namedNode(SUBSET_IRI);
  return [
    quad(dataset, RDF_TYPE, VOID_DATASET),
    quad(dataset, VOID_SUBSET, subset),
    quad(subset, DCTERMS_CONFORMS_TO, IIIF_PRESENTATION),
    quad(subset, VOID_ENTITIES, literal('2', XSD_INTEGER)),
  ];
}

function sampleQuad(manifestUrl: string): Quad {
  return quad(namedNode(SUBSET_IRI), MANIFEST_SAMPLE, namedNode(manifestUrl));
}

const validateByName: ValidateManifest = async (url: string) =>
  url.includes('good')
    ? {valid: true, reason: 'valid-manifest'}
    : {valid: false, reason: 'http-error'};

describe('IiifValidationExecutor', () => {
  it('passes VoID quads through and strips the manifest-sample triples', async () => {
    const inner = innerYielding([
      ...voidQuads(),
      sampleQuad('http://example.org/good/1'),
      sampleQuad('http://example.org/bad/2'),
    ]);

    const executor = new IiifValidationExecutor(inner, {
      validate: validateByName,
    });
    const out = await collect(await executor.execute(dataset, distribution));

    // VoID subset quads survive unchanged.
    expect(
      out.some(
        q =>
          q.predicate.equals(VOID_SUBSET) &&
          q.object.equals(namedNode(SUBSET_IRI)),
      ),
    ).toBe(true);
    expect(out.some(q => q.predicate.equals(DCTERMS_CONFORMS_TO))).toBe(true);
    expect(out.some(q => q.predicate.equals(VOID_ENTITIES))).toBe(true);

    // The intermediate manifest-sample triples never leak into the output.
    expect(out.some(q => q.predicate.equals(MANIFEST_SAMPLE))).toBe(false);
  });

  it('records DQV sampled and validated counts (k > 0)', async () => {
    const inner = innerYielding([
      ...voidQuads(),
      sampleQuad('http://example.org/good/1'),
      sampleQuad('http://example.org/bad/2'),
    ]);

    const executor = new IiifValidationExecutor(inner, {
      validate: validateByName,
    });
    const out = await collect(await executor.execute(dataset, distribution));

    expect(measurementValue(out, MANIFESTS_SAMPLED_METRIC.value)).toBe(2);
    expect(measurementValue(out, MANIFESTS_VALIDATED_METRIC.value)).toBe(1);

    // Measurements are computed on the dataset and carry the IIIF profile.
    const sampledMeasurement = out.find(
      q =>
        q.predicate.equals(DQV_IS_MEASUREMENT_OF) &&
        q.object.equals(MANIFESTS_SAMPLED_METRIC),
    )?.subject;
    expect(sampledMeasurement).toBeDefined();
    expect(
      out.some(
        q =>
          q.subject.equals(sampledMeasurement!) &&
          q.predicate.equals(DQV_COMPUTED_ON) &&
          q.object.equals(namedNode(DATASET_IRI)),
      ),
    ).toBe(true);
    expect(
      out.some(
        q =>
          q.subject.equals(sampledMeasurement!) &&
          q.predicate.equals(DCTERMS_CONFORMS_TO) &&
          q.object.equals(IIIF_PRESENTATION),
      ),
    ).toBe(true);

    // The dataset links to both measurements.
    expect(
      out.filter(
        q =>
          q.subject.equals(namedNode(DATASET_IRI)) &&
          q.predicate.equals(DQV_HAS_QUALITY_MEASUREMENT),
      ),
    ).toHaveLength(2);
  });

  it('records validated = 0 when every sampled manifest fails (k = 0)', async () => {
    const inner = innerYielding([
      ...voidQuads(),
      sampleQuad('http://example.org/bad/1'),
      sampleQuad('http://example.org/bad/2'),
    ]);

    const executor = new IiifValidationExecutor(inner, {
      validate: validateByName,
    });
    const out = await collect(await executor.execute(dataset, distribution));

    // The declared subset still passes through (state 2: declared but failing).
    expect(
      out.some(
        q =>
          q.predicate.equals(DCTERMS_CONFORMS_TO) &&
          q.object.equals(IIIF_PRESENTATION),
      ),
    ).toBe(true);
    expect(measurementValue(out, MANIFESTS_SAMPLED_METRIC.value)).toBe(2);
    expect(measurementValue(out, MANIFESTS_VALIDATED_METRIC.value)).toBe(0);
  });

  it('counts a manifest that throws during dereferencing as not validated', async () => {
    const validateThrowing: ValidateManifest = async (url: string) => {
      if (url.includes('throws')) throw new Error('boom');
      return {valid: true, reason: 'valid-manifest'};
    };
    const inner = innerYielding([
      ...voidQuads(),
      sampleQuad('http://example.org/good/1'),
      sampleQuad('http://example.org/throws/2'),
    ]);

    const executor = new IiifValidationExecutor(inner, {
      validate: validateThrowing,
    });
    const out = await collect(await executor.execute(dataset, distribution));

    // One validator rejection must not fail or drop the others.
    expect(measurementValue(out, MANIFESTS_SAMPLED_METRIC.value)).toBe(2);
    expect(measurementValue(out, MANIFESTS_VALIDATED_METRIC.value)).toBe(1);
  });

  it('emits no measurements when no IIIF is detected (no sample triples)', async () => {
    const inner = innerYielding([
      quad(namedNode(DATASET_IRI), RDF_TYPE, VOID_DATASET),
    ]);

    const executor = new IiifValidationExecutor(inner, {
      validate: validateByName,
    });
    const out = await collect(await executor.execute(dataset, distribution));

    expect(out).toHaveLength(1);
    expect(out.some(q => q.predicate.equals(DQV_HAS_QUALITY_MEASUREMENT))).toBe(
      false,
    );
  });

  it('passes NotSupported through unchanged', async () => {
    const inner: Executor = {
      async execute() {
        return new NotSupported('no distribution');
      },
    };

    const executor = new IiifValidationExecutor(inner, {
      validate: validateByName,
    });
    const result = await executor.execute(dataset, distribution);

    expect(result).toBeInstanceOf(NotSupported);
  });
});
