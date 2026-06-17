import {describe, it, expect} from 'vitest';
import {DataFactory} from 'n3';
import type {Quad} from '@rdfjs/types';
import {
  booleanMeasurement,
  integerMeasurement,
  provActivity,
} from '../src/measurements.js';

const {namedNode, blankNode} = DataFactory;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const PROV_ACTIVITY = 'http://www.w3.org/ns/prov#Activity';
const PROV_USED = 'http://www.w3.org/ns/prov#used';
const PROV_WAS_ASSOCIATED_WITH = 'http://www.w3.org/ns/prov#wasAssociatedWith';
const PROV_WAS_GENERATED_BY = 'http://www.w3.org/ns/prov#wasGeneratedBy';
const DQV_QUALITY_MEASUREMENT = 'http://www.w3.org/ns/dqv#QualityMeasurement';
const DQV_COMPUTED_ON = 'http://www.w3.org/ns/dqv#computedOn';
const DQV_IS_MEASUREMENT_OF = 'http://www.w3.org/ns/dqv#isMeasurementOf';
const DQV_VALUE = 'http://www.w3.org/ns/dqv#value';
const XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';
const XSD_BOOLEAN = 'http://www.w3.org/2001/XMLSchema#boolean';

/**
 * Normalise a quad to a `subject predicate object` tuple of IRI strings,
 * tagging a literal object with its datatype. Factory-agnostic, so terms minted
 * by `n3` and by `@tpluscode/rdf-ns-builders` compare equal.
 */
function triple(quad: Quad): string[] {
  const object =
    quad.object.termType === 'Literal'
      ? `${quad.object.value}^^${quad.object.datatype.value}`
      : quad.object.value;
  return [quad.subject.value, quad.predicate.value, object];
}

function triples(quads: Iterable<Quad>): string[][] {
  return [...quads].map(triple);
}

describe('provActivity', () => {
  it('emits the activity shape with a single prov:used', () => {
    const out = triples(
      provActivity(
        namedNode('http://example.org/activity'),
        namedNode('http://example.org/dataset'),
        namedNode('http://example.org/software'),
      ),
    );

    expect(out).toEqual([
      ['http://example.org/activity', RDF_TYPE, PROV_ACTIVITY],
      ['http://example.org/activity', PROV_USED, 'http://example.org/dataset'],
      [
        'http://example.org/activity',
        PROV_WAS_ASSOCIATED_WITH,
        'http://example.org/software',
      ],
    ]);
  });

  it('emits one prov:used per input, in order, for an array', () => {
    const out = triples(
      provActivity(
        namedNode('http://example.org/activity'),
        [
          namedNode('http://example.org/dataset'),
          namedNode('http://example.org/profile'),
        ],
        namedNode('http://example.org/software'),
      ),
    );

    expect(out).toEqual([
      ['http://example.org/activity', RDF_TYPE, PROV_ACTIVITY],
      ['http://example.org/activity', PROV_USED, 'http://example.org/dataset'],
      ['http://example.org/activity', PROV_USED, 'http://example.org/profile'],
      [
        'http://example.org/activity',
        PROV_WAS_ASSOCIATED_WITH,
        'http://example.org/software',
      ],
    ]);
  });

  it('accepts a blank node as the activity', () => {
    const activity = blankNode();
    const [first] = [
      ...provActivity(
        activity,
        namedNode('http://example.org/dataset'),
        namedNode('http://example.org/software'),
      ),
    ];
    expect(first.subject.equals(activity)).toBe(true);
  });
});

describe('integerMeasurement', () => {
  it('emits the DQV measurement shape with an xsd:integer value', () => {
    const out = triples(
      integerMeasurement(
        namedNode('http://example.org/measurement'),
        namedNode('http://example.org/subset'),
        namedNode('https://def.nde.nl/metric#subject-uris-sampled'),
        10,
        namedNode('http://example.org/activity'),
      ),
    );

    expect(out).toEqual([
      ['http://example.org/measurement', RDF_TYPE, DQV_QUALITY_MEASUREMENT],
      [
        'http://example.org/measurement',
        DQV_COMPUTED_ON,
        'http://example.org/subset',
      ],
      [
        'http://example.org/measurement',
        DQV_IS_MEASUREMENT_OF,
        'https://def.nde.nl/metric#subject-uris-sampled',
      ],
      ['http://example.org/measurement', DQV_VALUE, `10^^${XSD_INTEGER}`],
      [
        'http://example.org/measurement',
        PROV_WAS_GENERATED_BY,
        'http://example.org/activity',
      ],
    ]);
  });
});

describe('booleanMeasurement', () => {
  it('emits the DQV measurement shape with an xsd:boolean value', () => {
    const out = triples(
      booleanMeasurement(
        namedNode('http://example.org/measurement'),
        namedNode('http://example.org/subset'),
        namedNode('https://def.nde.nl/metric#subject-namespace-durable'),
        false,
        namedNode('http://example.org/activity'),
      ),
    );

    expect(out).toEqual([
      ['http://example.org/measurement', RDF_TYPE, DQV_QUALITY_MEASUREMENT],
      [
        'http://example.org/measurement',
        DQV_COMPUTED_ON,
        'http://example.org/subset',
      ],
      [
        'http://example.org/measurement',
        DQV_IS_MEASUREMENT_OF,
        'https://def.nde.nl/metric#subject-namespace-durable',
      ],
      ['http://example.org/measurement', DQV_VALUE, `false^^${XSD_BOOLEAN}`],
      [
        'http://example.org/measurement',
        PROV_WAS_GENERATED_BY,
        'http://example.org/activity',
      ],
    ]);
  });
});
