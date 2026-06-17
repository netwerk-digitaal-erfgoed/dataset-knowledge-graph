import {SparqlEndpointFetcher} from 'fetch-sparql-endpoint';
import {readFile, readdir, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {FileWriter} from '@lde/pipeline';
import {Dataset} from '@lde/dataset';
import {validationGraphPrefix} from './validationGraphIri.js';

/**
 * Reconcile the DKG output store with the Dataset Register.
 *
 * Each pipeline run writes a dataset’s summary into its own n-quads file (one
 * named graph per dataset, keyed on the dataset IRI) and its SHACL report into a
 * sibling n-quads file in a separate directory. A dataset that is removed from
 * the register or whose registration expires is simply no longer selected, so
 * its files are never rewritten and linger as “ghosts” — visible in downstream
 * consumers once the read-only QLever rebuilds its index from these files.
 *
 * This step deletes those orphans: it asks the register for the set of dataset
 * URIs that currently exist and are valid (the keep-set), then deletes every
 * `.nq` file whose dataset is not in that set.
 */

export interface GraphPrunerDependencies {
  /** The keep-set: entries (graph IRIs or file paths) that must be retained. */
  selectRegisteredDatasets: () => Promise<Set<string>>;
  /** Store entries (graph IRIs or file paths) present in the output store. */
  selectStoreGraphs: () => Promise<string[]>;
  /** Delete a single store entry (drop a graph, or remove a file). */
  dropGraph: (graphIri: string) => Promise<void>;
  /**
   * Map a store entry to the key compared against the keep-set. Defaults to
   * {@link datasetIriForGraph} (graph-IRI space, used by the SPARQL store). The
   * file pruner overrides it with identity because it already works — and builds
   * its keep-set — in file-path space.
   */
  keyOf?: (storeEntry: string) => string;
}

export interface PruneResult {
  registeredDatasets: number;
  prunedGraphs: string[];
  failedGraphs: string[];
}

/**
 * The dataset URI a graph belongs to: a summary graph IS the dataset URI; a
 * validation graph encodes it as its final, URL-encoded path segment.
 */
export function datasetIriForGraph(graphIri: string): string {
  const prefix = validationGraphPrefix();
  if (graphIri.startsWith(prefix)) {
    return decodeURIComponent(graphIri.slice(prefix.length));
  }
  return graphIri;
}

/** The store entries whose key is absent from the register keep-set. */
export function findOrphanedGraphs(
  storeGraphs: Iterable<string>,
  registeredDatasets: ReadonlySet<string>,
  keyOf: (storeEntry: string) => string = datasetIriForGraph,
): string[] {
  return [...storeGraphs].filter(
    storeEntry => !registeredDatasets.has(keyOf(storeEntry)),
  );
}

export async function pruneOrphanedGraphs(
  dependencies: GraphPrunerDependencies,
): Promise<PruneResult> {
  const registeredDatasets = await dependencies.selectRegisteredDatasets();

  // Fail closed: an empty keep-set would orphan — and therefore delete — every
  // entry in the store, so treat it as a register outage and prune nothing.
  if (registeredDatasets.size === 0) {
    throw new Error(
      'Refusing to prune: the Dataset Register returned no datasets, which ' +
        'would orphan the entire store.',
    );
  }

  const orphanedGraphs = findOrphanedGraphs(
    await dependencies.selectStoreGraphs(),
    registeredDatasets,
    dependencies.keyOf,
  );

  // Drop entries one by one and keep going on failure: the pipeline has already
  // written this run’s files, pruning is idempotent, and the next run reconciles
  // whatever is left, so a single failed delete must not abort the rest.
  const prunedGraphs: string[] = [];
  const failedGraphs: string[] = [];
  for (const graphIri of orphanedGraphs) {
    try {
      await dependencies.dropGraph(graphIri);
      prunedGraphs.push(graphIri);
    } catch {
      failedGraphs.push(graphIri);
    }
  }

  return {
    registeredDatasets: registeredDatasets.size,
    prunedGraphs,
    failedGraphs,
  };
}

/** Dataset URIs that currently exist in the register and are still valid. */
async function selectRegisteredDatasets(
  registryEndpoint: URL,
): Promise<Set<string>> {
  const registry = new SparqlEndpointFetcher();
  return collectColumn(
    await registry.fetchBindings(
      registryEndpoint.toString(),
      await readFile(
        resolve('queries/selection/registered-dataset.rq'),
        'utf-8',
      ),
    ),
    'dataset',
  );
}

export interface FileGraphPrunerOptions {
  /** SPARQL query endpoint of the Dataset Register. */
  registryEndpoint: URL;
  /** Directory holding the per-dataset summary `.nq` files. */
  summaryDir: string;
  /** Directory holding the per-dataset SHACL validation `.nq` files. */
  validationDir: string;
  /** Directory holding the per-dataset RDF-validity `.nq` files. */
  validityDir: string;
}

/**
 * Wire {@link pruneOrphanedGraphs} to the on-disk `.nq` cache: the register
 * supplies the keep-set, the cache directories supply the files to enumerate and
 * delete.
 *
 * The summary, validation and validity writers all name their file after the
 * *dataset* IRI (the graph IRI only sets each quad’s graph, not the filename), so
 * a single {@link FileWriter} reproduces the basename for every directory.
 * Reusing `getOutputPath` keeps that naming a single source of truth — the
 * keep-set paths are exactly what the pipeline wrote, including the replacement
 * character and extension.
 */
export function fileGraphPrunerDependencies(
  options: FileGraphPrunerOptions,
): GraphPrunerDependencies {
  const summaryWriter = new FileWriter({
    outputDir: options.summaryDir,
    format: 'n-quads',
  });
  const validationWriter = new FileWriter({
    outputDir: options.validationDir,
    format: 'n-quads',
  });
  const validityWriter = new FileWriter({
    outputDir: options.validityDir,
    format: 'n-quads',
  });

  const listNqFiles = async (directory: string): Promise<string[]> => {
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      // A directory that does not exist yet simply holds no files to prune.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return entries
      .filter(name => name.endsWith('.nq'))
      .map(name => join(directory, name));
  };

  return {
    // The keep-set is projected into file-path space: for every registered
    // dataset, the absolute path of both its summary and validation file. So
    // selectStoreGraphs and keyOf below also operate on absolute file paths.
    selectRegisteredDatasets: async () => {
      const datasets = await selectRegisteredDatasets(options.registryEndpoint);
      const keep = new Set<string>();
      for (const iri of datasets) {
        const dataset = new Dataset({iri: new URL(iri), distributions: []});
        keep.add(summaryWriter.getOutputPath(dataset));
        keep.add(validationWriter.getOutputPath(dataset));
        keep.add(validityWriter.getOutputPath(dataset));
      }
      return keep;
    },
    selectStoreGraphs: async () => [
      ...(await listNqFiles(options.summaryDir)),
      ...(await listNqFiles(options.validationDir)),
      ...(await listNqFiles(options.validityDir)),
    ],
    keyOf: filePath => filePath,
    dropGraph: filePath => rm(filePath, {force: true}),
  };
}

async function collectColumn(
  bindings: NodeJS.ReadableStream,
  variable: string,
): Promise<Set<string>> {
  const values = new Set<string>();
  for await (const binding of bindings as AsyncIterable<
    Record<string, {value: string}>
  >) {
    const term = binding[variable];
    if (term) {
      values.add(term.value);
    }
  }
  return values;
}
