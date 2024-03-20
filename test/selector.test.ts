import {SparqlQuerySelector} from '../src/selector';
import {QueryEngine} from '@comunica/query-sparql';
import {
  startLocalSparqlEndpoint,
  teardownSparqlEndpoint,
} from './localSparqlEndpoint';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

describe('SparqlQuerySelector', () => {
  beforeAll(async () => {
    await startLocalSparqlEndpoint(3002, 'fixtures/registry.ttl');
  }, 60000);

  afterAll(async () => {
    await teardownSparqlEndpoint();
  });

  describe('select', () => {
    it('should return a set of datasets', async () => {
      const selector = new SparqlQuerySelector(
        {
          query: (
            await readFile(
              resolve('queries/selection/dataset-with-rdf-distribution.rq')
            )
          ).toString(),
          endpoint: 'http://localhost:3002/sparql',
        },
        new QueryEngine()
      );

      const datasets = await selector.select();

      // TODO: should be 1 dataset with 2 distributions
      // see: https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph/issues/64
      expect(datasets.size).toBe(2);
      for (const dataset of datasets) {
        expect(dataset.distributions).toHaveLength(1);
      }
    });
  });
});
