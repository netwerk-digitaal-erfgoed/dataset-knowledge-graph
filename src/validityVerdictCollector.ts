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
 *
 * The pipeline can report a distribution’s validity more than once: a shallow
 * verdict from the probe (a small RDF body parses) followed by the authoritative
 * deep verdict from the import. We keep only one verdict per (dataset,
 * distribution) so the two cannot land on the same measurement node with
 * contradictory values. The probe always precedes the import, so last-write-wins
 * keeps the deep verdict; a distribution that is only probed (never imported)
 * keeps its shallow one.
 */
export class ValidityVerdictCollector implements ProgressReporter {
  private readonly collected = new Map<string, CollectedValidity>();
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
    // Key on (dataset, distribution); a newline cannot occur in either IRI, so
    // it is a safe separator. A later (deeper) verdict overwrites an earlier one.
    const key = `${this.currentDataset.iri.toString()}\n${distribution.accessUrl.toString()}`;
    this.collected.set(key, {
      dataset: this.currentDataset,
      distribution,
      verdict,
    });
  }

  /**
   * The collected verdicts, one per (dataset, distribution), in the order each
   * distribution was first reported.
   */
  verdicts(): readonly CollectedValidity[] {
    return [...this.collected.values()];
  }
}
