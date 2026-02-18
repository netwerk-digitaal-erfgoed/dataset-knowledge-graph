import {envSchema} from 'env-schema';

const schema = {
  type: 'object',
  properties: {
    GRAPHDB_URL: {
      type: 'string',
      default: 'http://localhost:7200',
    },
    GRAPHDB_USERNAME: {
      type: 'string',
      default: 'admin',
    },
    GRAPHDB_PASSWORD: {
      type: 'string',
      default: 'root',
    },
    GRAPHDB_REPOSITORY: {
      type: 'string',
      default: 'dataset-knowledge-graph',
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
  },
} as const;

interface Config {
  GRAPHDB_URL: string;
  GRAPHDB_USERNAME: string;
  GRAPHDB_PASSWORD: string;
  GRAPHDB_REPOSITORY: string;
  QLEVER_ENV: 'docker' | 'native';
  QLEVER_PORT: number;
  QLEVER_IMAGE?: string;
}

export const config = envSchema({
  schema,
  dotenv: {quiet: true},
}) as unknown as Config;
