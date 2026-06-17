import {describe, it, expect} from 'vitest';
import {Dataset, Distribution} from '@lde/dataset';
import type {ValidityVerdict} from '@lde/distribution-health';
import {ValidityVerdictCollector} from '../src/validityVerdictCollector.js';

const datasetA = new Dataset({
  iri: new URL('http://example.org/dataset/a'),
  distributions: [],
});
const datasetB = new Dataset({
  iri: new URL('http://example.org/dataset/b'),
  distributions: [],
});

const distribution = (url: string) => new Distribution(new URL(url));

const validVerdict: ValidityVerdict = {
  valid: true,
  validatedFingerprint: 'fp',
  depth: 'deep',
};
const invalidVerdict: ValidityVerdict = {
  valid: false,
  reason: 'parse-error',
  message: 'boom',
  validatedFingerprint: 'fp',
  depth: 'deep',
};

describe('ValidityVerdictCollector', () => {
  it('attributes each verdict to the dataset whose processing is current', () => {
    const collector = new ValidityVerdictCollector();

    collector.datasetStart(datasetA);
    collector.distributionValidated(
      distribution('http://a.example/d1'),
      validVerdict,
    );
    collector.datasetStart(datasetB);
    collector.distributionValidated(
      distribution('http://b.example/d1'),
      invalidVerdict,
    );

    expect(collector.verdicts()).toEqual([
      {
        dataset: datasetA,
        distribution: distribution('http://a.example/d1'),
        verdict: validVerdict,
      },
      {
        dataset: datasetB,
        distribution: distribution('http://b.example/d1'),
        verdict: invalidVerdict,
      },
    ]);
  });

  it('collects multiple distributions under the same dataset', () => {
    const collector = new ValidityVerdictCollector();

    collector.datasetStart(datasetA);
    collector.distributionValidated(
      distribution('http://a.example/d1'),
      validVerdict,
    );
    collector.distributionValidated(
      distribution('http://a.example/d2'),
      invalidVerdict,
    );

    expect(collector.verdicts()).toHaveLength(2);
    expect(collector.verdicts().every(v => v.dataset === datasetA)).toBe(true);
  });

  it('records a verdict for a failed-import dataset that produces no summary', () => {
    const collector = new ValidityVerdictCollector();

    // No stage runs for a dataset whose only distribution fails to import, but
    // datasetStart and distributionValidated still fire — that is exactly why
    // the verdict is routed here rather than emitted from a stage.
    collector.datasetStart(datasetA);
    collector.distributionValidated(
      distribution('http://a.example/broken'),
      invalidVerdict,
    );

    expect(collector.verdicts()).toEqual([
      {
        dataset: datasetA,
        distribution: distribution('http://a.example/broken'),
        verdict: invalidVerdict,
      },
    ]);
  });

  it('ignores a verdict that arrives before any dataset has started', () => {
    const collector = new ValidityVerdictCollector();

    collector.distributionValidated(
      distribution('http://orphan.example/d'),
      validVerdict,
    );

    expect(collector.verdicts()).toEqual([]);
  });
});
