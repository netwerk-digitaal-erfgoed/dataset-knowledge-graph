import type {Dataset, Distribution} from '@lde/dataset';
import type {ProgressReporter} from '@lde/pipeline';
import type {ValidityVerdict} from '@lde/distribution-health';

/** A validity verdict paired with the dataset and distribution it describes. */
export interface CollectedValidity {
  dataset: Dataset;
  distribution: Distribution;
  verdict: ValidityVerdict;
}

/**
 * A {@link ProgressReporter} that records every RDF-validity verdict the
 * pipeline emits, so a post-run pass can turn them into `def.nde.nl` quads —
 * including for datasets whose distribution failed to import and therefore
 * produced no summary (the `distributionValidated` callback fires for those
 * too, which is why routing the verdict here works where a pipeline stage
 * would not).
 *
 * The callback carries no dataset, so we attribute each verdict to the dataset
 * whose processing is current, tracked via `datasetStart`. This assumes the
 * pipeline processes datasets sequentially — true today.
 */
export class ValidityVerdictCollector implements ProgressReporter {
  private readonly collected: CollectedValidity[] = [];
  private currentDataset?: Dataset;

  datasetStart(dataset: Dataset): void {
    this.currentDataset = dataset;
  }

  distributionValidated(
    distribution: Distribution,
    verdict: ValidityVerdict,
  ): void {
    // A verdict with no dataset in scope cannot be attributed, so drop it. In
    // practice datasetStart always precedes distributionValidated, so this
    // guards only against a future change to the processing order.
    if (this.currentDataset === undefined) return;
    this.collected.push({
      dataset: this.currentDataset,
      distribution,
      verdict,
    });
  }

  /** The verdicts collected so far, in the order they were reported. */
  verdicts(): readonly CollectedValidity[] {
    return this.collected;
  }
}
