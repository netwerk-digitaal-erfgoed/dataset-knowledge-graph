import {SparqlQueryAnalyzer} from '../../src/analyzer.js';
import {UriSpaceAnalyzer} from '../../src/analyzer/uriSpace.js';
import {Dataset, Distribution} from '../../src/dataset.js';
import {Success} from '../../src/pipeline.js';
import {
  startLocalSparqlEndpoint,
  teardownSparqlEndpoint,
} from '../localSparqlEndpoint.js';
import factory from 'rdf-ext';

describe('UriSpaceAnalyzer', () => {
  const port = 3004;
  beforeAll(async () => {
    await startLocalSparqlEndpoint(
      port,
      'analyzer/fixtures/uriSpaceAnalysisTarget.trig',
    );
  }, 120000);

  afterAll(async () => {
    await teardownSparqlEndpoint();
  });

  describe('execute', () => {
    it('should analyze uri space', async () => {
      const analyzer = new UriSpaceAnalyzer(
        await SparqlQueryAnalyzer.fromFile('object-uri-space.rq'),
      );

      const distribution = Distribution.sparql(
        `http://localhost:${port}/sparql`,
        'http://foo.org/id/graph/foo',
      );
      const dataset = new Dataset('http://foo.org/id/dataset/foo', [
        distribution,
      ]);

      const result = await analyzer.execute(dataset);

      expect(result).toBeInstanceOf(Success);

      const data = (result as Success).data;
      expect(data.size).toBe(12);

      const linksets = data.match(
        null,
        factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        factory.namedNode('http://rdfs.org/ns/void#Linkset'),
      );
      expect(linksets.size).toBe(2);
      const linkset = [...linksets][0];
      expect(
        data.match(
          linkset.subject,
          factory.namedNode('http://rdfs.org/ns/void#subjectsTarget'),
          factory.namedNode('http://foo.org/id/dataset/foo'),
        ).size,
      ).toBe(1);
      expect(
        data.match(
          linkset.subject,
          factory.namedNode('http://rdfs.org/ns/void#objectsTarget'),
          factory.namedNode('http://vocab.getty.edu/aat'),
        ).size,
      ).toBe(1);
      expect(
        data.match(
          linkset.subject,
          factory.namedNode('http://rdfs.org/ns/void#triples'),
          factory.literal(
            '1',
            factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'),
          ),
        ).size,
      ).toBe(1);
      expect(
        data.match(
          factory.namedNode('http://vocab.getty.edu/aat'),
          factory.namedNode('http://purl.org/dc/terms/title'),
        ).size,
      ).toBe(2);

      const linkset2 = [...linksets][1];
      expect(
        data.match(
          linkset2.subject,
          factory.namedNode('http://rdfs.org/ns/void#objectsTarget'),
          factory.namedNode('https://www.geonames.org'),
        ).size,
      ).toBe(1);
    });
  });
});
