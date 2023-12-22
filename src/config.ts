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
    GRAPHDB_IMPORTS_URL: {
      type: 'string',
      default: 'http://localhost:7200',
    },
    GRAPHDB_IMPORTS_USERNAME: {
      type: 'string',
      default: 'admin',
    },
    GRAPHDB_IMPORTS_PASSWORD: {
      type: 'string',
      default: 'root',
    },
    GRAPHDB_IMPORTS_REPOSITORY: {
      type: 'string',
      default: 'dataset-knowledge-graph-imports',
    },
  },
};

export const config = envSchema({
  schema,
});
