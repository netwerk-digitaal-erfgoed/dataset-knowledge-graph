import {describe, it, expect} from 'vitest';
import {
  validityGraphIri,
  validityGraphPrefix,
} from '../src/validityGraphIri.js';

describe('validityGraphIri', () => {
  it('encodes the dataset IRI as the final, DKG-namespaced path segment', () => {
    const graph = validityGraphIri(
      new URL('https://lod.uba.uva.nl/UB-UVA/Books#dataset'),
    );

    expect(graph.toString()).toBe(
      validityGraphPrefix() +
        encodeURIComponent('https://lod.uba.uva.nl/UB-UVA/Books#dataset'),
    );
  });

  it('round-trips the dataset IRI back out of the graph IRI', () => {
    const datasetIri = 'https://lod.uba.uva.nl/UB-UVA/Books#dataset';
    const graph = validityGraphIri(new URL(datasetIri)).toString();

    expect(decodeURIComponent(graph.slice(validityGraphPrefix().length))).toBe(
      datasetIri,
    );
  });

  it('keeps validity graphs separate from the summary graph', () => {
    const datasetIri = new URL('https://example.org/dataset/a');
    expect(validityGraphIri(datasetIri).toString()).not.toBe(
      datasetIri.toString(),
    );
  });
});
