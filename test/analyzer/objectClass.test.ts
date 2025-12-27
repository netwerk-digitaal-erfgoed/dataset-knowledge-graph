import {ObjectClassAnalyzer} from '../../src/analyzer/objectClass.js';
import {Dataset, Distribution} from '../../src/dataset.js';
import {Success} from '../../src/pipeline.js';
import {
  startLocalSparqlEndpoint,
  teardownSparqlEndpoint,
} from '../localSparqlEndpoint.js';
import factory from 'rdf-ext';

describe('ObjectClassAnalyzer', () => {
  const port = 3007;
  beforeAll(async () => {
    await startLocalSparqlEndpoint(
      port,
      'analyzer/fixtures/objectClassAnalysisTarget.trig',
    );
  }, 60000);

  afterAll(async () => {
    await teardownSparqlEndpoint();
  });

  it('should produce object class partitions for each class/property/objectClass combination', async () => {
    const analyzer = await ObjectClassAnalyzer.create();

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

    // Should have object class partitions (void-ext:objectClassPartition)
    const objectClassPartitions = data.match(
      null,
      factory.namedNode('http://ldf.fi/void-ext#objectClassPartition'),
      null,
    );
    expect(objectClassPartitions.size).toBeGreaterThan(0);

    // Should have void:class values
    const objectClasses = data.match(
      null,
      factory.namedNode('http://rdfs.org/ns/void#class'),
      null,
    );
    expect(objectClasses.size).toBeGreaterThan(0);

    // Should have void:triples counts
    const tripleCounts = data.match(
      null,
      factory.namedNode('http://rdfs.org/ns/void#triples'),
      null,
    );
    expect(tripleCounts.size).toBeGreaterThan(0);

    // Check for ex:Person (from ex:author ex:person1, ex:person2)
    expect(
      data.match(
        null,
        factory.namedNode('http://rdfs.org/ns/void#class'),
        factory.namedNode('http://example.org/Person'),
      ).size,
    ).toBeGreaterThan(0);

    // Check for ex:Organization (from ex:publisher ex:org1)
    expect(
      data.match(
        null,
        factory.namedNode('http://rdfs.org/ns/void#class'),
        factory.namedNode('http://example.org/Organization'),
      ).size,
    ).toBeGreaterThan(0);
  });
});
