import {SparqlQueryAnalyzer} from '../../src/analyzer.js';
import {VocabularyAnalyzer} from '../../src/analyzer/vocabulary.js';
import {Dataset, Distribution} from '../../src/dataset.js';
import {Success} from '../../src/pipeline.js';
import {
  startLocalSparqlEndpoint,
  teardownSparqlEndpoint,
} from '../localSparqlEndpoint.js';
import {QueryEngine} from '@comunica/query-sparql';
import factory from 'rdf-ext';
import {DatasetCore, Quad, Quad_Subject} from 'rdf-js';
import NamedNodeExt from 'rdf-ext/lib/NamedNode';

const subject = (dataset: DatasetCore<Quad, Quad>): Quad_Subject | null =>
  dataset[Symbol.iterator]().next().value.subject;

describe('VocabularyAnalyzer', () => {
  const port = 3005;
  beforeAll(async () => {
    await startLocalSparqlEndpoint(
      port,
      'analyzer/fixtures/vocabularyAnalysisTarget.trig'
    );
  }, 60000);

  afterAll(async () => {
    await teardownSparqlEndpoint();
  });

  describe('execute', () => {
    it('should analyze vocabulary', async () => {
      const analyzer = new VocabularyAnalyzer(
        await SparqlQueryAnalyzer.fromFile(
          new QueryEngine(),
          'entity-properties.rq'
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

      expect(
        data.match(
          null,
          factory.namedNode('http://rdfs.org/ns/void#propertyPartition'),
          null
        ).size
      ).toBe(4);

      assertPartition(
        data,
        factory.namedNode('http://schema.org/name'),
        factory.namedNode('http://rdfs.org/ns/void#entities'),
        1
      );
      assertPartition(
        data,
        factory.namedNode('http://schema.org/name'),
        factory.namedNode('http://rdfs.org/ns/void#distinctObjects'),
        1
      );
      assertPartition(
        data,
        factory.namedNode('http://example.org/foo'),
        factory.namedNode('http://rdfs.org/ns/void#entities'),
        1
      );
      assertPartition(
        data,
        factory.namedNode('http://example.org/foo'),
        factory.namedNode('http://rdfs.org/ns/void#distinctObjects'),
        1
      );
      assertPartition(
        data,
        factory.namedNode('http://example.org/bar'),
        factory.namedNode('http://rdfs.org/ns/void#entities'),
        1
      );
      assertPartition(
        data,
        factory.namedNode('http://example.org/bar'),
        factory.namedNode('http://rdfs.org/ns/void#distinctObjects'),
        1
      );
      assertPartition(
        data,
        factory.namedNode('http://example.org/baz'),
        factory.namedNode('http://rdfs.org/ns/void#entities'),
        1
      );
      // TODO: This test fails due to https://github.com/comunica/comunica/issues/1312
      // assertPartition(
      //   data,
      //   factory.namedNode('http://example.org/baz'),
      //   factory.namedNode('http://rdfs.org/ns/void#distinctObjects'),
      //   3
      // );
      expect(
        data.match(
          factory.namedNode('http://foo.org/id/dataset/foo'),
          factory.namedNode('http://rdfs.org/ns/void#vocabulary'),
          factory.namedNode('http://schema.org')
        ).size
      ).toBe(1);
    });
  });
});

const assertPartition = (
  data: DatasetCore<Quad, Quad>,
  property: NamedNodeExt,
  partition: NamedNodeExt,
  entities: Number
) => {
  const fooPartition = data.match(
    null,
    factory.namedNode('http://rdfs.org/ns/void#property'),
    property
  );
  expect(fooPartition.size).toBe(1);
  expect(data.match(subject(fooPartition), partition, null).size).toBe(
    entities
  );
};
