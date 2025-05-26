import {Analyzer} from '../analyzer.js';
import {Dataset} from '../dataset.js';
import {DataFactory} from 'n3';
import {Failure, NotSupported, Success} from '../pipeline.js';
const {namedNode} = DataFactory;

const vocabularyPrefixes = new Map([
  ['http://schema.org/', 'http://schema.org'],
  ['https://schema.org/', 'http://schema.org'],
  [
    'https://www.ica.org/standards/RiC/ontology#',
    'https://www.ica.org/standards/RiC/ontology',
  ],
  ['http://www.cidoc-crm.org/cidoc-crm/', 'http://www.cidoc-crm.org/cidoc-crm'],
  ['http://purl.org/ontology/bibo/', 'http://purl.org/ontology/bibo/'],
  ['http://purl.org/dc/elements/1.1/', 'http://purl.org/dc/elements/1.1/'],
  ['http://purl.org/dc/terms/', 'http://purl.org/dc/terms/'],
  ['http://purl.org/dc/dcmitype/', 'http://purl.org/dc/dcmitype/'],
  [
    'http://www.w3.org/2004/02/skos/core#',
    'http://www.w3.org/2004/02/skos/core#',
  ],
  ['http://xmlns.com/foaf/0.1/', 'http://xmlns.com/foaf/0.1/'],
]);

export class VocabularyAnalyzer implements Analyzer {
  public readonly name = 'vocabulary';
  constructor(private readonly decorated: Analyzer) {}

  async execute(dataset: Dataset): Promise<Success | NotSupported | Failure> {
    const result = await this.decorated.execute(dataset);
    if (result instanceof NotSupported || result instanceof Failure) {
      return result;
    }

    for (const quad of result.data) {
      if ('http://rdfs.org/ns/void#property' === quad.predicate.value) {
        const match = [...vocabularyPrefixes].find(([prefix]) =>
          quad.object.value.startsWith(prefix)
        );
        if (match) {
          const [, vocabulary] = match;
          result.data.add(
            DataFactory.quad(
              namedNode(dataset.iri),
              namedNode('http://rdfs.org/ns/void#vocabulary'),
              namedNode(vocabulary)
            )
          );
        }
      }
    }

    return new Success(result.data);
  }
}
