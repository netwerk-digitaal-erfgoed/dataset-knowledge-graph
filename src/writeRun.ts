import {randomUUID} from 'node:crypto';
import type {Quad} from '@rdfjs/types';
import type {Dataset} from '@lde/dataset';
import type {Writer} from '@lde/pipeline';

/**
 * Write quads per dataset in a run transaction of their own, for passes that
 * run after the pipeline and so drive the `openRun → write* → flush → commit`
 * lifecycle themselves. Brackets the writes with exactly one commit or abort,
 * so a run-stateful writer is never left dangling on failure (as the
 * pipeline’s own driver does). The selection is exactly the datasets written.
 */
export async function writeRun(
  writer: Writer,
  entries: readonly {dataset: Dataset; quads: readonly Quad[]}[],
): Promise<void> {
  const run = await writer.openRun({
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    selectedSources: () => entries.map(({dataset}) => dataset.iri.toString()),
  });
  try {
    for (const {dataset, quads} of entries) {
      await run.write(dataset, toAsyncIterable(quads));
      await run.flush?.(dataset, 'success');
    }
    await run.commit();
  } catch (error) {
    await run.abort(error);
    throw error;
  }
}

async function* toAsyncIterable(quads: readonly Quad[]): AsyncIterable<Quad> {
  for (const quad of quads) yield quad;
}
