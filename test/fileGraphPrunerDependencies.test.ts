import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {mkdtemp, mkdir, rm, writeFile, readdir, access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FileWriter} from '@lde/pipeline';
import {Dataset} from '@lde/dataset';

// The register response is driven per test through this hoisted holder, so the
// reconciliation runs entirely offline.
const registered = vi.hoisted(() => ({iris: [] as string[]}));

vi.mock('fetch-sparql-endpoint', () => ({
  SparqlEndpointFetcher: class {
    async fetchBindings() {
      return (async function* () {
        for (const iri of registered.iris) {
          yield {dataset: {value: iri}};
        }
      })();
    }
  },
}));

const {fileGraphPrunerDependencies, pruneOrphanedGraphs} =
  await import('../src/pruneOrphanedGraphs.js');

const REGISTRY = new URL('http://example.com/registry/sparql');

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('fileGraphPrunerDependencies', () => {
  let root: string;
  let summaryDir: string;
  let validationDir: string;
  let summaryWriter: FileWriter;
  let validationWriter: FileWriter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'file-pruner-test-'));
    summaryDir = join(root, 'nq');
    validationDir = join(root, 'validation', 'nq');
    await mkdir(summaryDir, {recursive: true});
    await mkdir(validationDir, {recursive: true});
    summaryWriter = new FileWriter({outputDir: summaryDir, format: 'n-quads'});
    validationWriter = new FileWriter({
      outputDir: validationDir,
      format: 'n-quads',
    });
    registered.iris = [];
  });

  afterEach(async () => {
    await rm(root, {recursive: true, force: true});
  });

  function summaryPath(iri: string): string {
    return summaryWriter.getOutputPath(
      new Dataset({iri: new URL(iri), distributions: []}),
    );
  }
  function validationPath(iri: string): string {
    return validationWriter.getOutputPath(
      new Dataset({iri: new URL(iri), distributions: []}),
    );
  }

  async function seedDataset(iri: string): Promise<void> {
    await writeFile(summaryPath(iri), `<${iri}> a <urn:Dataset> <${iri}> .\n`);
    await writeFile(
      validationPath(iri),
      `<${iri}> a <urn:Report> <${iri}> .\n`,
    );
  }

  function prune() {
    return pruneOrphanedGraphs(
      fileGraphPrunerDependencies({
        registryEndpoint: REGISTRY,
        summaryDir,
        validationDir,
      }),
    );
  }

  it('deletes both files of an orphan and keeps the registered dataset', async () => {
    const kept = 'http://data.bibliotheken.nl/id/dataset/rise-alba';
    const orphan = 'http://data.dc4eu.nl/dataset/removed';
    await seedDataset(kept);
    await seedDataset(orphan);
    registered.iris = [kept];

    const result = await prune();

    expect(await exists(summaryPath(kept))).toBe(true);
    expect(await exists(validationPath(kept))).toBe(true);
    expect(await exists(summaryPath(orphan))).toBe(false);
    expect(await exists(validationPath(orphan))).toBe(false);
    expect(result.prunedGraphs.sort()).toEqual(
      [summaryPath(orphan), validationPath(orphan)].sort(),
    );
  });

  it('keeps a registered dataset that has only a summary (no violations file)', async () => {
    const kept = 'http://example.org/dataset/clean';
    await writeFile(
      summaryPath(kept),
      `<${kept}> a <urn:Dataset> <${kept}> .\n`,
    );
    registered.iris = [kept];

    const result = await prune();

    expect(await exists(summaryPath(kept))).toBe(true);
    expect(result.prunedGraphs).toEqual([]);
  });

  it('ignores in-flight *.tmp files', async () => {
    const kept = 'http://example.org/dataset/a';
    await seedDataset(kept);
    const leftoverTemp = `${summaryPath('http://example.org/dataset/b')}.tmp`;
    await writeFile(leftoverTemp, 'partial');
    registered.iris = [kept];

    const result = await prune();

    expect(await exists(leftoverTemp)).toBe(true);
    expect(result.prunedGraphs).toEqual([]);
  });

  it('refuses to prune when the register returns nothing', async () => {
    const orphan = 'http://example.org/dataset/x';
    await seedDataset(orphan);
    registered.iris = [];

    await expect(prune()).rejects.toThrow(/Refusing to prune/);
    expect(await exists(summaryPath(orphan))).toBe(true);
  });

  it('reports a file it cannot delete and still prunes the rest', async () => {
    const kept = 'http://example.org/dataset/keep';
    const deletable = 'http://example.org/dataset/deletable';
    const undeletable = 'http://example.org/dataset/undeletable';
    await seedDataset(kept);
    await seedDataset(deletable);
    // A non-empty directory named like a .nq file: rm(force, non-recursive)
    // throws on it, so it lands in failedGraphs without aborting the rest.
    await mkdir(summaryPath(undeletable));
    await writeFile(join(summaryPath(undeletable), 'child'), 'x');
    registered.iris = [kept];

    const result = await prune();

    expect(result.failedGraphs).toEqual([summaryPath(undeletable)]);
    expect(result.prunedGraphs).toContain(summaryPath(deletable));
    expect(await exists(summaryPath(deletable))).toBe(false);
  });

  it('matches the writer naming for IRIs with slashes and fragments', async () => {
    const kept = 'https://lod.uba.uva.nl/UB-UVA/Books#dataset';
    await seedDataset(kept);
    registered.iris = [kept];

    const result = await prune();

    // Nothing pruned: the keep-set path must equal the on-disk filename exactly.
    expect(result.prunedGraphs).toEqual([]);
    expect(await readdir(summaryDir)).toHaveLength(1);
  });
});
