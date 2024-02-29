import {SparqlQueryAnalyzer} from '../src/analyzer.js';
import {QueryEngine} from '@comunica/query-sparql';
import {Dataset, Distribution} from '../src/dataset.js';
import {NotSupported, Success} from '../src/pipeline.js';
import {startLocalSparqlEndpoint, teardown} from './local-sparql-endpoint';
import {jest} from '@jest/globals';

describe('SparqlQueryAnalyzer', () => {
  const port = 3001;
  beforeAll(async () => {
    await startLocalSparqlEndpoint(port, 'analysisTarget.trig');
  }, 60000);

  afterAll(async () => {
    await teardown();
  });

  describe('fromFile', () => {
    it('should create a new SparqlQueryAnalyzer from a file', async () => {
      const sparqlQueryAnalyzer = await SparqlQueryAnalyzer.fromFile(
        new QueryEngine(),
        'class-partition.rq'
      );

      expect(sparqlQueryAnalyzer).toBeInstanceOf(SparqlQueryAnalyzer);
    });
  });

  describe('execute', () => {
    it('should return a NotSupported when no SPARQL distribution is available', async () => {
      const sparqlQueryAnalyzer = new SparqlQueryAnalyzer(
        new QueryEngine(),
        'foo'
      );
      const dataset = new Dataset('http://example.org/dataset', []);
      jest.spyOn(dataset, 'getSparqlDistribution').mockReturnValue(null);

      const result = await sparqlQueryAnalyzer.execute(dataset);

      expect(result).toBeInstanceOf(NotSupported);
    });

    it('should apply named graph and subject filter in SPARQL query', async () => {
      const queryEngine = new QueryEngine();
      const querySpy = jest.spyOn(queryEngine, 'queryQuads');

      const sparqlQueryAnalyzer = new SparqlQueryAnalyzer(
        queryEngine,
        `CONSTRUCT {
          ?dataset ?p ?o .
        }
        #namedGraph#
        WHERE {
          #subjectFilter# ?p ?o .
        }`
      );
      const distribution = Distribution.sparql(
        `http://localhost:${port}/sparql`,
        'http://foo.org/id/graph/foo'
      );

      const datasetIri = 'http://foo.org/id/dataset/foo';
      const subjectFilter = '<http://example.org/foo>';
      const dataset = new Dataset(datasetIri, [distribution], subjectFilter);

      await sparqlQueryAnalyzer.execute(dataset);

      const expectedQuery = `CONSTRUCT {
          ?dataset ?p ?o .
        }
        FROM <http://foo.org/id/graph/foo>
        WHERE {
          <http://example.org/foo> ?p ?o .
        }`;
      expect(querySpy).toBeCalledWith(
        expect.stringContaining(expectedQuery),
        expect.any(Object)
      );
    });

    it('should store results of SPARQL query', async () => {
      const datasetIri = 'http://foo.org/id/dataset/foo';

      const sparqlQueryAnalyzer = new SparqlQueryAnalyzer(
        new QueryEngine(),
        `CONSTRUCT {
          ?dataset ?p ?o .
        }
        #namedGraph#
        WHERE {
          <${datasetIri}> ?p ?o .
        }`
      );
      const distribution = Distribution.sparql(
        `http://localhost:${port}/sparql`,
        'http://foo.org/id/graph/foo'
      );
      const dataset = new Dataset(datasetIri, [distribution]);

      const result = await sparqlQueryAnalyzer.execute(dataset);
      expect(result).toBeInstanceOf(Success);
      expect((result as Success).data.size).toBe(2);
    });
  });
});
