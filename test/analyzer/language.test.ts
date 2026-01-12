import {LanguageAnalyzer} from '../../src/analyzer/language.js';
import {Dataset, Distribution} from '../../src/dataset.js';
import {Success} from '../../src/pipeline.js';
import {
  startLocalSparqlEndpoint,
  teardownSparqlEndpoint,
} from '../localSparqlEndpoint.js';
import factory from 'rdf-ext';

describe('LanguageAnalyzer', () => {
  const port = 3008;
  beforeAll(async () => {
    await startLocalSparqlEndpoint(
      port,
      'analyzer/fixtures/languageAnalysisTarget.trig',
    );
  }, 60000);

  afterAll(async () => {
    await teardownSparqlEndpoint();
  });

  it('should produce language partitions for each class/property/language combination', async () => {
    const analyzer = await LanguageAnalyzer.create();

    const distribution = Distribution.sparql(
      `http://localhost:${port}/sparql`,
      'http://foo.org/id/graph/foo',
    );
    const dataset = new Dataset('http://foo.org/id/dataset/foo', [distribution]);

    const result = await analyzer.execute(dataset);

    expect(result).toBeInstanceOf(Success);

    const data = (result as Success).data;

    // Should have language partitions (void-ext:languagePartition)
    const languagePartitions = data.match(
      null,
      factory.namedNode('http://ldf.fi/void-ext#languagePartition'),
      null,
    );
    expect(languagePartitions.size).toBeGreaterThan(0);

    // Should have void-ext:language values
    const languages = data.match(
      null,
      factory.namedNode('http://ldf.fi/void-ext#language'),
      null,
    );
    expect(languages.size).toBeGreaterThan(0);

    // Should have void:triples counts
    const tripleCounts = data.match(
      null,
      factory.namedNode('http://rdfs.org/ns/void#triples'),
      null,
    );
    expect(tripleCounts.size).toBeGreaterThan(0);

    // Check for English language tag
    expect(
      data.match(
        null,
        factory.namedNode('http://ldf.fi/void-ext#language'),
        factory.literal('en'),
      ).size,
    ).toBeGreaterThan(0);

    // Check for Dutch language tag
    expect(
      data.match(
        null,
        factory.namedNode('http://ldf.fi/void-ext#language'),
        factory.literal('nl'),
      ).size,
    ).toBeGreaterThan(0);

    // Check for French language tag
    expect(
      data.match(
        null,
        factory.namedNode('http://ldf.fi/void-ext#language'),
        factory.literal('fr'),
      ).size,
    ).toBeGreaterThan(0);
  });
});
