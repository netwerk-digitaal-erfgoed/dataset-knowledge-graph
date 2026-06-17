import {describe, it, expect} from 'vitest';
import type {Quad} from '@rdfjs/types';
import {Dataset, Distribution} from '@lde/dataset';
import type {Writer} from '@lde/pipeline';
import type {ValidityVerdict} from '@lde/distribution-health';
import {writeDistributionValidity} from '../src/writeDistributionValidity.js';
import type {CollectedValidity} from '../src/validityVerdictCollector.js';

const DQV_COMPUTED_ON = 'http://www.w3.org/ns/dqv#computedOn';
const FAILURE_REASON = 'https://def.nde.nl/failure#reason';

const options = {
  generatedAt: new Date('2026-06-16T10:00:00.000Z'),
  producer:
    'https://www.npmjs.com/package/@netwerk-digitaal-erfgoed/knowledge-graph',
};

const datasetA = new Dataset({
  iri: new URL('http://example.org/dataset/a'),
  distributions: [],
});

/** Captures what the pipeline writer would receive, per dataset. */
class CapturingWriter implements Writer {
  readonly writes: {dataset: Dataset; quads: Quad[]}[] = [];
  readonly flushed: Dataset[] = [];

  async write(dataset: Dataset, quads: AsyncIterable<Quad>): Promise<void> {
    const collected: Quad[] = [];
    for await (const quad of quads) collected.push(quad);
    this.writes.push({dataset, quads: collected});
  }

  async flush(dataset: Dataset): Promise<void> {
    this.flushed.push(dataset);
  }
}

const valid: ValidityVerdict = {
  valid: true,
  validatedFingerprint: 'fp',
  depth: 'deep',
};
const invalid: ValidityVerdict = {
  valid: false,
  reason: 'parse-error',
  message: 'boom',
  validatedFingerprint: 'fp',
  depth: 'deep',
};

function collected(verdict: ValidityVerdict, url: string): CollectedValidity {
  return {
    dataset: datasetA,
    distribution: new Distribution(new URL(url)),
    verdict,
  };
}

describe('writeDistributionValidity', () => {
  it('writes one file per dataset and flushes it', async () => {
    const writer = new CapturingWriter();

    const count = await writeDistributionValidity(
      [collected(valid, 'http://a.example/d1')],
      writer,
      options,
    );

    expect(count).toBe(1);
    expect(writer.writes).toHaveLength(1);
    expect(writer.writes[0].dataset).toBe(datasetA);
    expect(writer.flushed).toEqual([datasetA]);
    expect(
      writer.writes[0].quads.some(
        q =>
          q.predicate.value === DQV_COMPUTED_ON &&
          q.object.value === 'http://a.example/d1',
      ),
    ).toBe(true);
  });

  it('merges several distributions of one dataset into a single write', async () => {
    const writer = new CapturingWriter();

    await writeDistributionValidity(
      [
        collected(valid, 'http://a.example/d1'),
        collected(invalid, 'http://a.example/d2'),
      ],
      writer,
      options,
    );

    expect(writer.writes).toHaveLength(1);
    const computedOn = writer.writes[0].quads
      .filter(q => q.predicate.value === DQV_COMPUTED_ON)
      .map(q => q.object.value)
      .sort();
    expect(computedOn).toEqual(['http://a.example/d1', 'http://a.example/d2']);
    // The invalid verdict carries its failure reason through.
    expect(
      writer.writes[0].quads.some(q => q.predicate.value === FAILURE_REASON),
    ).toBe(true);
  });

  it('writes nothing when no verdicts were collected', async () => {
    const writer = new CapturingWriter();
    const count = await writeDistributionValidity([], writer, options);
    expect(count).toBe(0);
    expect(writer.writes).toEqual([]);
  });
});
