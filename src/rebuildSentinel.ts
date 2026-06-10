import {mkdir, rename, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

/**
 * Signal the serving QLever to rebuild its index from the n-quads cache.
 *
 * Written after every run — whether it succeeds or fails partway — so a
 * partially failed run still publishes the set it managed to process, and the
 * QLever picks up the changes regardless of the pipeline’s exit status. The
 * write is atomic (temp + rename) so the polling serving pod never observes a
 * half-written marker. The body is a timestamp, purely for operator visibility.
 */
export async function publishRebuildSentinel(
  sentinelPath: string,
  body: string = new Date().toISOString(),
): Promise<void> {
  await mkdir(dirname(sentinelPath), {recursive: true});
  const tempPath = `${sentinelPath}.tmp`;
  await writeFile(tempPath, `${body}\n`);
  await rename(tempPath, sentinelPath);
}
