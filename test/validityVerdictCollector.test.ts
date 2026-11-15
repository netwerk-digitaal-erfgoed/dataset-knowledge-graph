import {describe, it, expect} from 'vitest';
import {Dataset, Distribution} from '@lde/dataset';
import type {ValidityVerdict} from '@lde/distribution-health';
import type {PipelineEvent} from '@lde/pipeline';
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

const envelope = {
  defaultLevel: 'info',
  timestamp: new Date(),
  runId: 'run',
} as const;

function validated(
  dataset: Dataset,
  url: string,
  verdict: ValidityVerdict,
): PipelineEvent {
  return {
    ...envelope,
    type: 'distributionValidated',
    dataset,
    distribution: distribution(url),
    verdict,
  };
}

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
  it('attributes each verdict to the dataset its event names', () => {
    const collector = new ValidityVerdictCollector();

    collector.onEvent(validated(datasetA, 'http://a.example/d1', validVerdict));
    collector.onEvent(
      validated(datasetB, 'http://b.example/d1', invalidVerdict),
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

    collector.onEvent(validated(datasetA, 'http://a.example/d1', validVerdict));
    collector.onEvent(
      validated(datasetA, 'http://a.example/d2', invalidVerdict),
    );

    expect(collector.verdicts()).toHaveLength(2);
    expect(collector.verdicts().every(v => v.dataset === datasetA)).toBe(true);
  });

  it('keeps only the later verdict when a distribution is reported twice (shallow then deep)', () => {
    const collector = new ValidityVerdictCollector();
    const shallowValid: ValidityVerdict = {
      valid: true,
      validatedFingerprint: 'fp',
      depth: 'shallow',
    };
    const deepInvalid: ValidityVerdict = {
      valid: false,
      reason: 'empty',
      validatedFingerprint: 'fp',
      depth: 'deep',
    };

    collector.onEvent(validated(datasetA, 'http://a.example/d1', shallowValid));
    collector.onEvent(validated(datasetA, 'http://a.example/d1', deepInvalid));

    // One entry for the distribution, carrying the later (deep) verdict.
    expect(collector.verdicts()).toEqual([
      {
        dataset: datasetA,
        distribution: distribution('http://a.example/d1'),
        verdict: deepInvalid,
      },
    ]);
  });

  it('records a verdict for a failed-import dataset that produces no summary', () => {
    const collector = new ValidityVerdictCollector();

    // No stage runs for a dataset whose only distribution fails to import, but
    // distributionValidated still fires – that is exactly why the verdict is
    // routed here rather than emitted from a stage.
    collector.onEvent(
      validated(datasetA, 'http://a.example/broken', invalidVerdict),
    );

    expect(collector.verdicts()).toEqual([
      {
        dataset: datasetA,
        distribution: distribution('http://a.example/broken'),
        verdict: invalidVerdict,
      },
    ]);
  });

  it('ignores every other event', () => {
    const collector = new ValidityVerdictCollector();

    collector.onEvent({...envelope, type: 'datasetStart', dataset: datasetA});

    expect(collector.verdicts()).toEqual([]);
  });
});
