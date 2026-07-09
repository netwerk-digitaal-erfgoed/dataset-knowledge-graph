import {randomUUID} from 'node:crypto';
import type {Quad} from '@rdfjs/types';
import {Dataset} from '@lde/dataset';
import type {Writer} from '@lde/pipeline';
import {distributionValidityQuads} from './distributionValidity.js';
import type {CollectedValidity} from './validityVerdictCollector.js';

export interface WriteDistributionValidityOptions {
  /** When the verdicts were produced; stamped on every measurement. */
  generatedAt: Date;
  /** IRI of the software credited with the verdicts (prov:wasAssociatedWith). */
  producer: string;
}

/**
 * Persist collected RDF-validity verdicts as `def.nde.nl` quads, one file/graph
 * per dataset. Runs after the pipeline so it captures distributions whose RDF
 * failed to import — datasets that produced no summary at all.
 *
 * Verdicts are grouped by dataset (a dataset may have several distributions) so
 * each dataset’s verdicts are written and flushed together, keeping every quad
 * in that dataset’s validity graph (set by the writer’s `graphIri`).
 *
 * Returns the number of datasets written.
 */
export async function writeDistributionValidity(
  collected: readonly CollectedValidity[],
  writer: Writer,
  options: WriteDistributionValidityOptions,
): Promise<number> {
  const byDataset = new Map<string, {dataset: Dataset; quads: Quad[]}>();
  for (const {dataset, distribution, verdict} of collected) {
    const key = dataset.iri.toString();
    const entry = byDataset.get(key) ?? {dataset, quads: []};
    entry.quads.push(
      ...distributionValidityQuads(verdict, {
        distributionUrl: distribution.accessUrl.toString(),
        generatedAt: options.generatedAt,
        producer: options.producer,
      }),
    );
    byDataset.set(key, entry);
  }

  // Own run transaction: this pass runs after the pipeline, writing through a
  // writer of its own, so it drives the `openRun → write* → flush → commit`
  // lifecycle itself. The selection is exactly the datasets written here.
  const sources = [...byDataset.keys()];
  const run = await writer.openRun({
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    selectedSources: () => sources,
  });
  for (const {dataset, quads} of byDataset.values()) {
    await run.write(dataset, toAsyncIterable(quads));
    await run.flush?.(dataset, 'success');
  }
  await run.commit();

  return byDataset.size;
}

async function* toAsyncIterable(quads: readonly Quad[]): AsyncIterable<Quad> {
  for (const quad of quads) yield quad;
}
