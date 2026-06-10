import {describe, it, expect, vi} from 'vitest';
import {
  datasetIriForGraph,
  findOrphanedGraphs,
  pruneOrphanedGraphs,
  type GraphPrunerDependencies,
} from '../src/pruneOrphanedGraphs.js';
import {validationGraphIri} from '../src/validationGraphIri.js';

const SUMMARY_GRAPH = 'http://data.bibliotheken.nl/id/dataset/rise-alba';
const VALIDATION_GRAPH = validationGraphIri(new URL(SUMMARY_GRAPH)).toString();

describe('datasetIriForGraph', () => {
  it('returns a summary graph IRI unchanged', () => {
    expect(datasetIriForGraph(SUMMARY_GRAPH)).toBe(SUMMARY_GRAPH);
  });

  it('decodes the dataset IRI from a validation graph IRI', () => {
    expect(datasetIriForGraph(VALIDATION_GRAPH)).toBe(SUMMARY_GRAPH);
  });

  it('round-trips dataset IRIs containing slashes and fragments', () => {
    const datasetIri = 'https://lod.uba.uva.nl/UB-UVA/Books#dataset';
    expect(
      datasetIriForGraph(validationGraphIri(new URL(datasetIri)).toString()),
    ).toBe(datasetIri);
  });
});

describe('findOrphanedGraphs', () => {
  it('keeps graphs whose dataset is registered and drops the rest', () => {
    const registered = new Set([SUMMARY_GRAPH]);
    const orphan = 'http://data.dc4eu.nl/dataset/removed';

    expect(
      findOrphanedGraphs([SUMMARY_GRAPH, VALIDATION_GRAPH, orphan], registered),
    ).toEqual([orphan]);
  });

  it('treats a validation graph as orphaned when its dataset is gone', () => {
    expect(findOrphanedGraphs([VALIDATION_GRAPH], new Set())).toEqual([
      VALIDATION_GRAPH,
    ]);
  });

  it('honours a custom keyOf so the comparison runs in another key space', () => {
    // Identity keyOf: compare store entries directly against the keep-set
    // (file-path space), bypassing the validation-graph IRI decoding.
    const keep = new Set(['/cache/a.nq']);
    expect(
      findOrphanedGraphs(
        ['/cache/a.nq', '/cache/b.nq'],
        keep,
        filePath => filePath,
      ),
    ).toEqual(['/cache/b.nq']);
  });
});

describe('pruneOrphanedGraphs', () => {
  const baseDependencies = (
    overrides: Partial<GraphPrunerDependencies> = {},
  ): GraphPrunerDependencies => ({
    selectRegisteredDatasets: async () => new Set([SUMMARY_GRAPH]),
    selectStoreGraphs: async () => [SUMMARY_GRAPH, VALIDATION_GRAPH],
    dropGraph: vi.fn(async () => {}),
    ...overrides,
  });

  it('drops only the graphs of unregistered datasets', async () => {
    const orphan = 'http://data.dc4eu.nl/dataset/removed';
    const dropGraph = vi.fn(async () => {});
    const result = await pruneOrphanedGraphs(
      baseDependencies({
        selectStoreGraphs: async () => [SUMMARY_GRAPH, orphan],
        dropGraph,
      }),
    );

    expect(dropGraph).toHaveBeenCalledExactlyOnceWith(orphan);
    expect(result.prunedGraphs).toEqual([orphan]);
    expect(result.registeredDatasets).toBe(1);
  });

  it('refuses to prune when the register returns nothing', async () => {
    const dropGraph = vi.fn(async () => {});
    await expect(
      pruneOrphanedGraphs(
        baseDependencies({
          selectRegisteredDatasets: async () => new Set(),
          dropGraph,
        }),
      ),
    ).rejects.toThrow(/Refusing to prune/);
    expect(dropGraph).not.toHaveBeenCalled();
  });

  it('keeps going when a single drop fails and reports it', async () => {
    const firstOrphan = 'http://data.dc4eu.nl/dataset/a';
    const secondOrphan = 'http://data.dc4eu.nl/dataset/b';
    const dropGraph = vi.fn(async (graphIri: string) => {
      if (graphIri === firstOrphan) {
        throw new Error('boom');
      }
    });

    const result = await pruneOrphanedGraphs(
      baseDependencies({
        selectStoreGraphs: async () => [firstOrphan, secondOrphan],
        dropGraph,
      }),
    );

    expect(result.failedGraphs).toEqual([firstOrphan]);
    expect(result.prunedGraphs).toEqual([secondOrphan]);
  });
});
