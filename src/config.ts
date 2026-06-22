import {envSchema} from 'env-schema';

const schema = {
  type: 'object',
  properties: {
    // Base output directory. The per-purpose subdirectories below are derived
    // from it (see the derivation after the schema), and the served QLever
    // indexes every `*.nq` beneath it: one file per dataset, each quad in its
    // named graph. In production this is the shared PVC mount (`/data`); the
    // default keeps `npm run dev` self-contained.
    //
    // A single configured root keeps the directory layout here, rather than
    // duplicated across the deployment manifests and the QLever index glob, so a
    // new per-dataset output type needs no deployment change: it lands in a new
    // subdirectory and the recursive index glob picks it up. (The RDF-validity
    // verdicts went unserved precisely because a new per-directory env var and
    // the glob had to be kept in sync by hand.)
    OUTPUT_DIR: {
      type: 'string',
      default: 'output',
    },
    // Optional per-purpose overrides, normally unset: each defaults to a
    // subdirectory of OUTPUT_DIR (summaries, validation, provenance, validity).
    // The directories hold n-quads but carry no `nq` segment: the format is the
    // same everywhere, and the index glob already matches on the `.nq`
    // extension, so a Turtle inspection copy alongside is never indexed. Kept as
    // escape hatches for relocating a single file set, and so an explicit
    // per-directory env still wins.
    OUTPUT_CACHE_DIR: {type: 'string'},
    OUTPUT_VALIDATION_CACHE_DIR: {type: 'string'},
    OUTPUT_PROVENANCE_CACHE_DIR: {type: 'string'},
    OUTPUT_VALIDITY_CACHE_DIR: {type: 'string'},
    // Query endpoint of the served (read-only) QLever the previous run's
    // records were loaded into. The skip gate reads them from here at the start
    // of a run. Leave unset (e.g. local `npm run dev`) to disable skipping and
    // reprocess every dataset; set it in production to enable skipping.
    SERVED_SPARQL_ENDPOINT: {
      type: 'string',
    },
    // Marker file the pipeline writes (atomically) after every run, success or
    // partial failure, to signal the serving QLever to rebuild its index from
    // whatever n-quads were produced. Defaults to
    // `<OUTPUT_DIR>/summaries/.rebuild`.
    REBUILD_SENTINEL_PATH: {
      type: 'string',
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
  OUTPUT_DIR: string;
  OUTPUT_CACHE_DIR: string;
  OUTPUT_VALIDATION_CACHE_DIR: string;
  OUTPUT_PROVENANCE_CACHE_DIR: string;
  OUTPUT_VALIDITY_CACHE_DIR: string;
  SERVED_SPARQL_ENDPOINT?: string;
  REBUILD_SENTINEL_PATH: string;
  QLEVER_ENV: 'docker' | 'native';
  QLEVER_PORT: number;
  QLEVER_IMAGE?: string;
  QLEVER_MEMORY_MAX_SIZE: string;
  QLEVER_QUERY_TIMEOUT: string;
  SPARQL_REQUEST_TIMEOUT_MS: number;
}

// Raw env shape: the per-purpose directories (and the rebuild sentinel) are
// optional here because each is derived from OUTPUT_DIR when left unset.
type RawConfig = Omit<
  Config,
  | 'OUTPUT_CACHE_DIR'
  | 'OUTPUT_VALIDATION_CACHE_DIR'
  | 'OUTPUT_PROVENANCE_CACHE_DIR'
  | 'OUTPUT_VALIDITY_CACHE_DIR'
  | 'REBUILD_SENTINEL_PATH'
> & {
  OUTPUT_CACHE_DIR?: string;
  OUTPUT_VALIDATION_CACHE_DIR?: string;
  OUTPUT_PROVENANCE_CACHE_DIR?: string;
  OUTPUT_VALIDITY_CACHE_DIR?: string;
  REBUILD_SENTINEL_PATH?: string;
};

const raw = envSchema({
  schema,
  dotenv: true,
}) as unknown as RawConfig;

// Derive each per-purpose directory from OUTPUT_DIR unless explicitly
// overridden, so the layout has a single source of truth (see OUTPUT_DIR above).
const base = raw.OUTPUT_DIR;
export const config: Config = {
  ...raw,
  OUTPUT_CACHE_DIR: raw.OUTPUT_CACHE_DIR ?? `${base}/summaries`,
  OUTPUT_VALIDATION_CACHE_DIR:
    raw.OUTPUT_VALIDATION_CACHE_DIR ?? `${base}/validation`,
  OUTPUT_PROVENANCE_CACHE_DIR:
    raw.OUTPUT_PROVENANCE_CACHE_DIR ?? `${base}/provenance`,
  OUTPUT_VALIDITY_CACHE_DIR:
    raw.OUTPUT_VALIDITY_CACHE_DIR ?? `${base}/validity`,
  REBUILD_SENTINEL_PATH:
    raw.REBUILD_SENTINEL_PATH ?? `${base}/summaries/.rebuild`,
};
