import {DataFactory} from 'n3';
import type {BlankNode, Literal, NamedNode, Quad} from '@rdfjs/types';
import {dqv, prov, rdf, xsd} from '@tpluscode/rdf-ns-builders';

const {literal, quad} = DataFactory;

/**
 * A structural node a stage mints for its activity or measurement: a skolem
 * `NamedNode` (so it survives a merge into the dataset graph) or a `BlankNode`
 * (for dataset-scoped nodes that never leave their graph).
 */
type StructuralNode = NamedNode | BlankNode;

/**
 * The shared PROV activity shape the analysis stages emit before deriving a
 * measurement from it: a `prov:Activity` that `prov:used` one or more inputs
 * and `prov:wasAssociatedWith` the `software` that carried it out. Pass an array
 * to record several inputs (e.g. the dataset and the profile it was validated
 * against), in order. Measurements then back-link the activity with
 * `prov:wasGeneratedBy`.
 */
export function* provActivity(
  activity: StructuralNode,
  used: NamedNode | readonly NamedNode[],
  software: NamedNode,
): Generator<Quad> {
  yield quad(activity, rdf.type, prov.Activity);
  for (const input of Array.isArray(used) ? used : [used]) {
    yield quad(activity, prov.used, input);
  }
  yield quad(activity, prov.wasAssociatedWith, software);
}

/**
 * A DQV quality measurement carrying an `xsd:integer` value: typed
 * `dqv:QualityMeasurement`, `dqv:computedOn` its subject, `dqv:isMeasurementOf`
 * the metric, the `dqv:value`, and `prov:wasGeneratedBy` the {@link provActivity}
 * that produced it.
 */
export function* integerMeasurement(
  measurement: StructuralNode,
  computedOn: StructuralNode,
  metricNode: NamedNode,
  value: number,
  activity: StructuralNode,
): Generator<Quad> {
  yield* typedMeasurement(
    measurement,
    computedOn,
    metricNode,
    literal(String(value), xsd.integer),
    activity,
  );
}

/** A {@link integerMeasurement} variant carrying an `xsd:boolean` value. */
export function* booleanMeasurement(
  measurement: StructuralNode,
  computedOn: StructuralNode,
  metricNode: NamedNode,
  value: boolean,
  activity: StructuralNode,
): Generator<Quad> {
  yield* typedMeasurement(
    measurement,
    computedOn,
    metricNode,
    literal(String(value), xsd.boolean),
    activity,
  );
}

/** The DQV quality-measurement shape shared by every typed-value variant. */
function* typedMeasurement(
  measurement: StructuralNode,
  computedOn: StructuralNode,
  metricNode: NamedNode,
  value: Literal,
  activity: StructuralNode,
): Generator<Quad> {
  yield quad(measurement, rdf.type, dqv.QualityMeasurement);
  yield quad(measurement, dqv.computedOn, computedOn);
  yield quad(measurement, dqv.isMeasurementOf, metricNode);
  yield quad(measurement, dqv.value, value);
  yield quad(measurement, prov.wasGeneratedBy, activity);
}
