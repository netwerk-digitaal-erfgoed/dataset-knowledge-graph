import {describe, it, expect} from 'vitest';
import type {Quad} from '@rdfjs/types';
import type {ValidityVerdict} from '@lde/distribution-health';
import {
  distributionValidityQuads,
  type ValidityProvenance,
} from '../src/distributionValidity.js';

const DQV = 'http://www.w3.org/ns/dqv#';
const PROV = 'http://www.w3.org/ns/prov#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const METRIC = 'https://def.nde.nl/metric#';
const PROBE = 'https://def.nde.nl/probe#';
const FAILURE = 'https://def.nde.nl/failure#';
const VALIDITY_FAILURE = 'https://def.nde.nl/distribution-validity-failure#';

const DISTRIBUTION = 'http://example.org/data.rdf';

const provenance: ValidityProvenance = {
  distributionUrl: DISTRIBUTION,
  generatedAt: new Date('2026-06-16T10:00:00.000Z'),
  producer: 'https://www.npmjs.com/package/@lde/pipeline',
};

function collect(verdict: ValidityVerdict): Quad[] {
  return [...distributionValidityQuads(verdict, provenance)];
}

const validVerdict: ValidityVerdict = {
  valid: true,
  validatedFingerprint: 'fp-1',
  depth: 'deep',
};

describe('distributionValidityQuads', () => {
  it('mints the measurement as a stable skolem IRI, not a blank node (issue #352)', () => {
    const measurementOf = () =>
      collect(validVerdict).find(
        q => q.predicate.value === `${DQV}isMeasurementOf`,
      )?.subject;

    const measurement = measurementOf();
    expect(measurement?.termType).toBe('NamedNode');
    // Derived from the distribution, so re-running is idempotent.
    expect(measurementOf()!.value).toBe(measurement!.value);
  });

  it('emits a DQV measurement of the validity metric computed on the distribution', () => {
    const out = collect(validVerdict);

    const measurement = out.find(
      q =>
        q.predicate.value === `${DQV}isMeasurementOf` &&
        q.object.value === `${METRIC}distribution-rdf-valid`,
    )?.subject;
    expect(measurement).toBeDefined();

    expect(
      out.some(
        q =>
          q.subject.equals(measurement!) &&
          q.predicate.value === `${RDF_TYPE}` &&
          q.object.value === `${DQV}QualityMeasurement`,
      ),
    ).toBe(true);
    expect(
      out.some(
        q =>
          q.subject.equals(measurement!) &&
          q.predicate.value === `${DQV}computedOn` &&
          q.object.value === DISTRIBUTION,
      ),
    ).toBe(true);

    const value = out.find(
      q =>
        q.subject.equals(measurement!) && q.predicate.value === `${DQV}value`,
    );
    expect(value?.object.value).toBe('true');
    expect('datatype' in value!.object && value!.object.datatype.value).toBe(
      `${XSD}boolean`,
    );

    expect(
      out.some(
        q =>
          q.subject.equals(measurement!) &&
          q.predicate.value === `${PROBE}sourceFingerprint` &&
          q.object.value === 'fp-1',
      ),
    ).toBe(true);
  });

  it('attributes the measurement to a PROV activity associated with the producer, stamped with the time', () => {
    const out = collect(validVerdict);
    const measurement = out.find(
      q => q.predicate.value === `${DQV}isMeasurementOf`,
    )!.subject;

    const activity = out.find(
      q =>
        q.subject.equals(measurement) &&
        q.predicate.value === `${PROV}wasGeneratedBy`,
    )?.object;
    expect(activity).toBeDefined();
    expect(
      out.some(
        q =>
          q.subject.equals(activity!) &&
          q.predicate.value === `${RDF_TYPE}` &&
          q.object.value === `${PROV}Activity`,
      ),
    ).toBe(true);
    expect(
      out.some(
        q =>
          q.subject.equals(activity!) &&
          q.predicate.value === `${PROV}wasAssociatedWith` &&
          q.object.value === provenance.producer,
      ),
    ).toBe(true);

    const generatedAt = out.find(
      q =>
        q.subject.equals(measurement) &&
        q.predicate.value === `${PROV}generatedAtTime`,
    );
    expect(generatedAt?.object.value).toBe('2026-06-16T10:00:00.000Z');
    expect(
      'datatype' in generatedAt!.object && generatedAt!.object.datatype.value,
    ).toBe(`${XSD}dateTime`);
  });

  it('records the typed reason and parser message for an invalid verdict', () => {
    const out = collect({
      valid: false,
      reason: 'parse-error',
      message: 'QName not allowed for property: rdf:Description',
      validatedFingerprint: 'fp-1',
      depth: 'deep',
    });

    const value = out.find(q => q.predicate.value === `${DQV}value`);
    expect(value?.object.value).toBe('false');

    const reason = out.find(q => q.predicate.value === `${FAILURE}reason`);
    expect(reason?.object.value).toBe(`${VALIDITY_FAILURE}parse-error`);
    const usage = reason!.subject;
    expect(
      out.some(
        q =>
          q.subject.equals(usage) &&
          q.predicate.value === `${PROV}entity` &&
          q.object.value === DISTRIBUTION,
      ),
    ).toBe(true);
    const message = out.find(
      q => q.subject.equals(usage) && q.predicate.value === `${FAILURE}message`,
    );
    expect(message?.object.value).toBe(
      'QName not allowed for property: rdf:Description',
    );
  });

  it('records the empty reason with no message', () => {
    const out = collect({
      valid: false,
      reason: 'empty',
      validatedFingerprint: 'fp-1',
      depth: 'deep',
    });
    expect(
      out.some(
        q =>
          q.predicate.value === `${FAILURE}reason` &&
          q.object.value === `${VALIDITY_FAILURE}empty`,
      ),
    ).toBe(true);
    expect(out.some(q => q.predicate.value === `${FAILURE}message`)).toBe(
      false,
    );
  });

  it('emits no failure usage for a valid verdict', () => {
    const out = collect(validVerdict);
    expect(out.some(q => q.predicate.value === `${FAILURE}reason`)).toBe(false);
    expect(out.some(q => q.predicate.value === `${PROV}qualifiedUsage`)).toBe(
      false,
    );
  });

  it('omits the fingerprint when the verdict has none', () => {
    const out = collect({...validVerdict, validatedFingerprint: null});
    expect(
      out.some(q => q.predicate.value === `${PROBE}sourceFingerprint`),
    ).toBe(false);
  });
});
