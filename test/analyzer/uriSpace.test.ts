import {SparqlQueryAnalyzer} from '../../src/analyzer.js';
import {UriSpaceAnalyzer} from '../../src/analyzer/uriSpace.js';
import {Dataset, Distribution} from '../../src/dataset.js';
import {Success} from '../../src/pipeline.js';
import {
  startLocalSparqlEndpoint,
  teardownSparqlEndpoint,
} from '../localSparqlEndpoint.js';
import {QueryEngine} from '@comunica/query-sparql';

describe('UriSpaceAnalyzer', () => {
  const port = 3004;
  beforeAll(async () => {
    await startLocalSparqlEndpoint(
      port,
      'analyzer/fixtures/uriSpaceAnalysisTarget.trig'
    );
  }, 120000);

  afterAll(async () => {
    await teardownSparqlEndpoint();
  });

  describe('execute', () => {
    it('should analyze uri space', async () => {
      const analyzer = new UriSpaceAnalyzer(
        await SparqlQueryAnalyzer.fromFile(
          new QueryEngine(),
          'object-uri-space.rq'
        )
      );

      const distribution = Distribution.sparql(
        `http://localhost:${port}/sparql`,
        'http://foo.org/id/graph/foo'
      );
      const dataset = new Dataset('http://foo.org/id/dataset/foo', [
        distribution,
      ]);

      const result = await analyzer.execute(dataset);

      expect(result).toBeInstanceOf(Success);

      const data = (result as Success).data;

      console.log(data.size);

      for (const quad of data) {
        console.log(quad);
      }
    });
  });
});
