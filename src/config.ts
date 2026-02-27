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
  },
} as const;

interface Config {
  SPARQL_UPDATE_URL?: string;
  SPARQL_UPDATE_AUTHORIZATION?: string;
  QLEVER_ENV: 'docker' | 'native';
  QLEVER_PORT: number;
  QLEVER_IMAGE?: string;
}

export const config = envSchema({
  schema,
  dotenv: {quiet: true},
}) as unknown as Config;
