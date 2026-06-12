import {describe, it, expect} from 'vitest';
import {DataFactory} from 'n3';
import type {Quad} from '@rdfjs/types';
import {failureUsageQuads} from '../src/failureUsage.js';

const {namedNode, blankNode} = DataFactory;

const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const PROV_USED = namedNode('http://www.w3.org/ns/prov#used');
const PROV_QUALIFIED_USAGE = namedNode(
  'http://www.w3.org/ns/prov#qualifiedUsage',
);
const PROV_USAGE = namedNode('http://www.w3.org/ns/prov#Usage');
const PROV_ENTITY = namedNode('http://www.w3.org/ns/prov#entity');
const FAILURE_REASON = namedNode('https://def.nde.nl/failure#reason');

const TIMEOUT = namedNode(
  'https://def.nde.nl/subject-resolution-failure#timeout',
);
const HTTP_ERROR = namedNode(
  'https://def.nde.nl/subject-resolution-failure#http-error',
);

function collect(quads: Iterable<Quad>): Quad[] {
  return [...quads];
}

describe('failureUsageQuads', () => {
  it('emits the qualified-usage shape for each failure', () => {
    const activity = blankNode('activity');
    const out = collect(
      failureUsageQuads(activity, [
        {url: 'http://example.org/id/1', reasonIri: TIMEOUT},
        {url: 'http://example.org/id/2', reasonIri: HTTP_ERROR},
      ]),
    );

    // One prov:used and one prov:qualifiedUsage per failure, on the activity.
    expect(
      out.filter(
        q => q.subject.equals(activity) && q.predicate.equals(PROV_USED),
      ),
    ).toHaveLength(2);
    const usages = out.filter(
      q =>
        q.subject.equals(activity) && q.predicate.equals(PROV_QUALIFIED_USAGE),
    );
    expect(usages).toHaveLength(2);

    // Each usage carries a type, the failed entity and exactly one reason.
    for (const url of ['http://example.org/id/1', 'http://example.org/id/2']) {
      const entity = namedNode(url);
      const usage = out.find(
        q => q.predicate.equals(PROV_ENTITY) && q.object.equals(entity),
      )?.subject;
      expect(usage).toBeDefined();
      expect(
        out.some(
          q =>
            q.subject.equals(usage!) &&
            q.predicate.equals(RDF_TYPE) &&
            q.object.equals(PROV_USAGE),
        ),
      ).toBe(true);
      expect(
        out.filter(
          q => q.subject.equals(usage!) && q.predicate.equals(FAILURE_REASON),
        ),
      ).toHaveLength(1);
      // The activity also prov:used the failed entity directly.
      expect(
        out.some(
          q =>
            q.subject.equals(activity) &&
            q.predicate.equals(PROV_USED) &&
            q.object.equals(entity),
        ),
      ).toBe(true);
    }

    // The reason values match what was passed in.
    expect(
      out.some(
        q => q.predicate.equals(FAILURE_REASON) && q.object.equals(TIMEOUT),
      ),
    ).toBe(true);
    expect(
      out.some(
        q => q.predicate.equals(FAILURE_REASON) && q.object.equals(HTTP_ERROR),
      ),
    ).toBe(true);
  });

  it('emits nothing for an empty failure list', () => {
    expect(collect(failureUsageQuads(blankNode('activity'), []))).toHaveLength(
      0,
    );
  });
});
