import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {mkdtemp, rm, readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {publishRebuildSentinel} from '../src/rebuildSentinel.js';

describe('publishRebuildSentinel', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rebuild-sentinel-test-'));
  });

  afterEach(async () => {
    await rm(root, {recursive: true, force: true});
  });

  it('writes the marker, creating parent directories', async () => {
    const sentinel = join(root, 'nq', '.rebuild');

    await publishRebuildSentinel(sentinel, '2026-06-10T00:00:00.000Z');

    expect(await readFile(sentinel, 'utf-8')).toBe(
      '2026-06-10T00:00:00.000Z\n',
    );
    // The atomic write leaves no temp file behind.
    expect(await readdir(join(root, 'nq'))).toEqual(['.rebuild']);
  });

  it('overwrites an existing marker', async () => {
    const sentinel = join(root, '.rebuild');
    await writeFile(sentinel, 'stale\n');

    await publishRebuildSentinel(sentinel, 'fresh');

    expect(await readFile(sentinel, 'utf-8')).toBe('fresh\n');
  });

  it('still fires from a finally block when the work threw', async () => {
    const sentinel = join(root, '.rebuild');

    await expect(
      (async () => {
        try {
          throw new Error('pipeline failed partway');
        } finally {
          await publishRebuildSentinel(sentinel, 'after-failure');
        }
      })(),
    ).rejects.toThrow('pipeline failed partway');

    // The marker was written despite the failure — the processed set is published.
    expect(await readFile(sentinel, 'utf-8')).toBe('after-failure\n');
  });
});
