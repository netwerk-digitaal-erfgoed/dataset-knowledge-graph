import {envSchema} from 'env-schema';

const schema = {
  type: 'object',
  properties: {
    SPARQL_UPDATE_URL: {
      type: 'string',
    },
    SPARQL_UPDATE_AUTHORIZATION: {
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
    // QLever’s server-side per-query timeout. Keep it higher than the
    // pipeline’s per-request timeout (the adaptiveTimeoutPolicy defaultMs in
    // main.ts, currently 300s and not exposed as an env var) so that the client
    // policy stays the binding limit and this only acts as a backstop. Set it
    // below that and QLever cuts queries off before the client budget is spent,
    // as the old 120s did to the ~2-minute analysis queries on large datasets.
    QLEVER_QUERY_TIMEOUT: {
      type: 'string',
      default: '600s',
    },
  },
} as const;

interface Config {
  SPARQL_UPDATE_URL?: string;
  SPARQL_UPDATE_AUTHORIZATION?: string;
  QLEVER_ENV: 'docker' | 'native';
  QLEVER_PORT: number;
  QLEVER_IMAGE?: string;
  QLEVER_MEMORY_MAX_SIZE: string;
  QLEVER_QUERY_TIMEOUT: string;
}

export const config = envSchema({
  schema,
  dotenv: true,
}) as unknown as Config;
