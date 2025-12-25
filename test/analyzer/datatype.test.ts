import {DatatypeAnalyzer} from '../../src/analyzer/datatype.js';
import {Dataset, Distribution} from '../../src/dataset.js';
import {Success} from '../../src/pipeline.js';
import {
  startLocalSparqlEndpoint,
  teardownSparqlEndpoint,
} from '../localSparqlEndpoint.js';
import factory from 'rdf-ext';

describe('Datatype analyzers', () => {
  const port = 3006;
  beforeAll(async () => {
    await startLocalSparqlEndpoint(
      port,
      'analyzer/fixtures/datatypeAnalysisTarget.trig',
    );
  }, 60000);

  afterAll(async () => {
    await teardownSparqlEndpoint();
  });

  describe('DatatypeAnalyzer', () => {
    it('should produce datatype partitions for each class/property/datatype combination', async () => {
      const analyzer = await DatatypeAnalyzer.create();

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

      // Should have datatype partitions (void-ext:datatypePartition)
      const datatypePartitions = data.match(
        null,
        factory.namedNode('http://ldf.fi/void-ext#datatypePartition'),
        null,
      );
      expect(datatypePartitions.size).toBeGreaterThan(0);

      // Should have void-ext:datatype values
      const datatypes = data.match(
        null,
        factory.namedNode('http://ldf.fi/void-ext#datatype'),
        null,
      );
      expect(datatypes.size).toBeGreaterThan(0);

      // Should have void:triples counts
      const tripleCounts = data.match(
        null,
        factory.namedNode('http://rdfs.org/ns/void#triples'),
        null,
      );
      expect(tripleCounts.size).toBeGreaterThan(0);

      // Check for xsd:string (from ex:name "foo", "bar")
      expect(
        data.match(
          null,
          factory.namedNode('http://ldf.fi/void-ext#datatype'),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#string'),
        ).size,
      ).toBeGreaterThan(0);

      // Check for xsd:integer (from ex:count 42, 100)
      expect(
        data.match(
          null,
          factory.namedNode('http://ldf.fi/void-ext#datatype'),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'),
        ).size,
      ).toBeGreaterThan(0);

      // Check for xsd:date (from ex:date "2024-01-01"^^xsd:date)
      expect(
        data.match(
          null,
          factory.namedNode('http://ldf.fi/void-ext#datatype'),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#date'),
        ).size,
      ).toBeGreaterThan(0);

      // Should have void-ext:datatypes count at dataset level
      const datatypesCount = data.match(
        factory.namedNode('http://foo.org/id/dataset/foo'),
        factory.namedNode('http://ldf.fi/void-ext#datatypes'),
        null,
      );
      expect(datatypesCount.size).toBe(1);

      // Should be 3 distinct datatypes: xsd:string, xsd:integer, xsd:date
      const countQuad = datatypesCount[Symbol.iterator]().next().value;
      expect(parseInt(countQuad.object.value)).toBe(3);
    });
  });
});
