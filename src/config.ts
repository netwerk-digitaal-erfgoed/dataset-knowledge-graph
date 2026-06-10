import {envSchema} from 'env-schema';

const schema = {
  type: 'object',
  properties: {
    // Directory the per-dataset summary n-quads are written to (one file per
    // analysed dataset, each quad in a named graph = the dataset IRI). This is
    // the DKG's output store: a long-running, read-only QLever co-located on the
    // same node rebuilds its index from these files. In production this points
    // at the shared PVC mount; the default keeps `npm run dev` self-contained.
    OUTPUT_CACHE_DIR: {
      type: 'string',
      default: 'output/nq',
    },
    // Directory the per-dataset SHACL validation reports are written to as
    // n-quads (each quad in its derived `validationGraphIri` graph). Kept in a
    // separate directory from OUTPUT_CACHE_DIR so the two file sets are pruned
    // and indexed independently.
    OUTPUT_VALIDATION_CACHE_DIR: {
      type: 'string',
      default: 'output/validation/nq',
    },
    // Marker file the pipeline writes (atomically) after every run — success or
    // partial failure — to signal the serving QLever to rebuild its index from
    // whatever n-quads were produced. Decoupling the rebuild from the pipeline's
    // exit status means a partially-failed run still publishes the set it did
    // process. In production this sits on the shared PVC the serving pod polls.
    REBUILD_SENTINEL_PATH: {
      type: 'string',
      default: 'output/nq/.rebuild',
    },
    QLEVER_ENV: {
      type: 'string',
      enum: ['docker', 'native'],
      default: 'docker',
    },
    QLEVER_PORT: {
      type: 'number',
      default: 7001,
    },
    QLEVER_IMAGE: {
      type: 'string',
    },
    // QLever’s own memory ceiling for query processing and caching (the result
    // cache is part of this budget, so it bounds cache-max-size too). Kept below
    // the container memory limit (16 GiB in production): when an analysis query
    // over a large dataset would exceed this, QLever aborts it with an HTTP 500
    // that the pipeline catches per stage and continues, instead of growing past
    // the container limit and getting the whole pod OOM-killed (in native mode
    // QLever shares the pod’s memory budget with this process, so an OOM kill
    // would take the run down with it).
    QLEVER_MEMORY_MAX_SIZE: {
      type: 'string',
      default: '12G',
    },
    // QLever’s server-side per-query timeout. Keep it higher than the pipeline’s
    // per-request timeout (SPARQL_REQUEST_TIMEOUT_MS, applied as the
    // adaptiveTimeoutPolicy defaultMs in main.ts) so that the client policy stays
    // the binding limit and this only acts as a backstop. Set it below that and
    // QLever cuts queries off before the client budget is spent, as the old 120s
    // did to the ~2-minute analysis queries on large datasets.
    QLEVER_QUERY_TIMEOUT: {
      type: 'string',
      default: '600s',
    },
    // Per-request timeout (milliseconds) for SPARQL queries against endpoints,
    // including the local QLever server. Applied by adaptiveTimeoutPolicy in
    // main.ts as the default budget, so it is the effective upper bound on a
    // single query; keep QLEVER_QUERY_TIMEOUT above it. Covers SPARQL query
    // requests only (remote endpoints and the local QLever), not data-dump
    // downloads or imports, which are timed out separately by the downloader.
    SPARQL_REQUEST_TIMEOUT_MS: {
      type: 'number',
      default: 300_000,
    },
  },
} as const;

interface Config {
  OUTPUT_CACHE_DIR: string;
  OUTPUT_VALIDATION_CACHE_DIR: string;
  REBUILD_SENTINEL_PATH: string;
  QLEVER_ENV: 'docker' | 'native';
  QLEVER_PORT: number;
  QLEVER_IMAGE?: string;
  QLEVER_MEMORY_MAX_SIZE: string;
  QLEVER_QUERY_TIMEOUT: string;
  SPARQL_REQUEST_TIMEOUT_MS: number;
}

export const config = envSchema({
  schema,
  dotenv: true,
}) as unknown as Config;
