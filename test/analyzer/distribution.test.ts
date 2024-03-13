import {
  ImportSuccessful,
  RdfDumpImporter,
  SparqlClient,
} from '../../src/importer.js';
import {DistributionAnalyzer} from '../../src/analyzer/distribution.js';
import {Dataset, Distribution} from '../../src/dataset.js';
import {
  startLocalSparqlEndpoint,
  teardownSparqlEndpoint,
} from '../localSparqlEndpoint.js';
import {
  startLocalDataDumpEndpoint,
  teardownDataDumpEndpoint,
} from './localDataDumpEndpoint.js';
import {Success} from '../../src/pipeline.js';
import factory from 'rdf-ext';

describe('DistributionAnalyzer', () => {
  const port = 3003;
  const dumpPort = 8082;

  beforeAll(async () => {
    await startLocalSparqlEndpoint(
      port,
      'analyzer/fixtures/distributionAnalysisTargetSparql.ttl'
    );

    await startLocalDataDumpEndpoint(dumpPort, 'fixtures/');
  }, 120000);

  afterAll(async () => {
    await teardownSparqlEndpoint();
    await teardownDataDumpEndpoint();
  });

  describe('execute', () => {
    it('should analyze distribution with sparql endpoint', async () => {
      const successSparqlClient: SparqlClient = {
        import: () => Promise.resolve(new ImportSuccessful('foo', 'bar')),
      };

      const importer = new RdfDumpImporter(successSparqlClient);
      const distributionAnalyzer = new DistributionAnalyzer(importer);

      const distribution = Distribution.sparql(
        `http://localhost:${port}/sparql`,
        'http://foo.org/id/graph/foo'
      );
      const dataset = new Dataset('http://foo.org/id/dataset/foo', [
        distribution,
      ]);

      const result = await distributionAnalyzer.execute(dataset);
      expect(result).toBeInstanceOf(Success);
      const data = (result as Success).data;

      expect(data.size).toBe(4);
      expect(
        data.match(
          null,
          factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          factory.namedNode('https://schema.org/Action')
        ).size
      ).toBe(1);
      expect(
        data.match(
          null,
          factory.namedNode('https://schema.org/result'),
          factory.namedNode('http://localhost:3003/sparql')
        ).size
      ).toBe(1);
      expect(
        data.match(
          null,
          factory.namedNode('https://schema.org/target'),
          factory.namedNode('http://localhost:3003/sparql')
        ).size
      ).toBe(1);
      expect(
        data.match(
          factory.namedNode('http://foo.org/id/dataset/foo'),
          factory.namedNode('http://rdfs.org/ns/void#sparqlEndpoint'),
          factory.namedNode('http://localhost:3003/sparql')
        ).size
      ).toBe(1);
    });

    it('should analyze distribution with data dump', async () => {
      const successSparqlClient: SparqlClient = {
        import: () => Promise.resolve(new ImportSuccessful('foo', 'bar')),
      };

      const importer = new RdfDumpImporter(successSparqlClient);
      const distributionAnalyzer = new DistributionAnalyzer(importer);

      const distribution = new Distribution();
      distribution.isValid = true;
      distribution.accessUrl = `http://localhost:${dumpPort}/distributionAnalysisTargetDump.ttl`;
      distribution.mimeType = 'text/turtle';

      const dataset = new Dataset('http://foo.org/id/dataset/foo', [
        distribution,
      ]);

      const result = await distributionAnalyzer.execute(dataset);
      expect(result).toBeInstanceOf(Success);
      const data = (result as Success).data;

      expect(data.size).toBe(6);
      expect(
        data.match(
          null,
          factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          factory.namedNode('https://schema.org/Action')
        ).size
      ).toBe(1);
      expect(
        data.match(
          null,
          factory.namedNode('https://schema.org/target'),
          factory.namedNode(
            `http://localhost:${dumpPort}/distributionAnalysisTargetDump.ttl`
          )
        ).size
      ).toBe(1);
      expect(
        data.match(
          null,
          factory.namedNode('https://schema.org/result'),
          factory.namedNode(
            `http://localhost:${dumpPort}/distributionAnalysisTargetDump.ttl`
          )
        ).size
      ).toBe(1);
      expect(
        data.match(
          factory.namedNode(
            `http://localhost:${dumpPort}/distributionAnalysisTargetDump.ttl`
          ),
          factory.namedNode('https://schema.org/dateModified'),
          null
        ).size
      ).toBe(1);
      expect(
        data.match(
          factory.namedNode(
            `http://localhost:${dumpPort}/distributionAnalysisTargetDump.ttl`
          ),
          factory.namedNode('https://schema.org/contentSize'),
          factory.literal(
            '377',
            factory.namedNode('http://www.w3.org/2001/XMLSchema#integer')
          )
        ).size
      ).toBe(1);
      expect(
        data.match(
          factory.namedNode('http://foo.org/id/dataset/foo'),
          factory.namedNode('http://rdfs.org/ns/void#dataDump'),
          factory.namedNode(
            `http://localhost:${dumpPort}/distributionAnalysisTargetDump.ttl`
          )
        ).size
      ).toBe(1);
    });

    it('should analyze distribution with data dump and report invalid url', async () => {
      const successSparqlClient: SparqlClient = {
        import: () => Promise.resolve(new ImportSuccessful('foo', 'bar')),
      };

      const importer = new RdfDumpImporter(successSparqlClient);
      const distributionAnalyzer = new DistributionAnalyzer(importer);

      const distribution = new Distribution();
      distribution.isValid = true;
      distribution.accessUrl = 'foo.nt.gz';

      const dataset = new Dataset('http://foo.org/id/dataset/foo', [
        distribution,
      ]);

      const result = await distributionAnalyzer.execute(dataset);
      expect(result).toBeInstanceOf(Success);
      const data = (result as Success).data;

      expect(data.size).toBe(3);
      expect(
        data.match(
          null,
          factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          factory.namedNode('https://schema.org/Action')
        ).size
      ).toBe(1);
      expect(
        data.match(
          null,
          factory.namedNode('https://schema.org/target'),
          factory.namedNode('foo.nt.gz')
        ).size
      ).toBe(1);
      expect(
        data.match(
          null,
          factory.namedNode('https://schema.org/error'),
          factory.literal('TypeError: Invalid URL')
        ).size
      ).toBe(1);
    });

    it('should analyze distribution with data dump and report not found', async () => {
      const successSparqlClient: SparqlClient = {
        import: () => Promise.resolve(new ImportSuccessful('foo', 'bar')),
      };

      const importer = new RdfDumpImporter(successSparqlClient);
      const distributionAnalyzer = new DistributionAnalyzer(importer);

      const distribution = new Distribution();
      distribution.isValid = true;
      distribution.accessUrl = 'http://foo.org/foo.nt.gz';

      const dataset = new Dataset('http://foo.org/id/dataset/foo', [
        distribution,
      ]);

      const result = await distributionAnalyzer.execute(dataset);
      expect(result).toBeInstanceOf(Success);
      const data = (result as Success).data;

      expect(data.size).toBe(3);
      expect(
        data.match(
          null,
          factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          factory.namedNode('https://schema.org/Action')
        ).size
      ).toBe(1);
      expect(
        data.match(
          null,
          factory.namedNode('https://schema.org/target'),
          factory.namedNode('http://foo.org/foo.nt.gz')
        ).size
      ).toBe(1);
      expect(
        data.match(
          null,
          factory.namedNode('https://schema.org/error'),
          factory.literal('Error: getaddrinfo ENOTFOUND foo.org')
        ).size
      ).toBe(1);
    });
  });
});
