import {Analyzer, BaseAnalyzer} from '../analyzer.js';
import {getCatalog} from '@netwerk-digitaal-erfgoed/network-of-terms-catalog';
import {
  Dataset as TerminologySource,
  IRI,
} from '@netwerk-digitaal-erfgoed/network-of-terms-query';
import {Dataset} from '../dataset.js';
import {DataFactory, Store} from 'n3';
import {Context, Failure, NotSupported, Success} from '../pipeline.js';
import type {Quad} from '@rdfjs/types';

const {quad, namedNode, blankNode, literal} = DataFactory;

const catalog = await getCatalog();

export class UriSpaceAnalyzer extends BaseAnalyzer {
  public readonly name = 'uri-space';
  private terminologyMetadata = new Store(); // Store for default graph metadata

  constructor(private readonly decorated: Analyzer) {
    super();
  }

  async execute(
    dataset: Dataset,
    context?: Context,
  ): Promise<Success | NotSupported | Failure> {
    const result = await this.decorated.execute(dataset, context);
    if (result instanceof NotSupported || result instanceof Failure) {
      return result;
    }

    const resultMap = new Map<IRI, number>();
    let uriSpace: IRI | undefined;
    for (const quad of result.data) {
      if ('http://rdfs.org/ns/void#objectsTarget' === quad.predicate.value) {
        try {
          uriSpace = catalog.getDatasetByTermIri(quad.object.value)?.iri;
        } catch (e) {
          // Ignore invalid HTTP IRI.
        }
      }

      if (
        'http://rdfs.org/ns/void#triples' === quad.predicate.value &&
        uriSpace !== undefined
      ) {
        resultMap.set(
          uriSpace,
          (resultMap.get(uriSpace) ?? 0) + parseInt(quad.object.value),
        );
      }
    }

    return new Success(
      [...resultMap].reduce((store, [k, v]) => {
        const linkset = blankNode();
        store.add(
          quad(
            linkset,
            namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            namedNode('http://rdfs.org/ns/void#Linkset'),
          ),
        );
        store.add(
          quad(
            linkset,
            namedNode('http://rdfs.org/ns/void#subjectsTarget'),
            namedNode(dataset.iri),
          ),
        );
        store.add(
          quad(
            linkset,
            namedNode('http://rdfs.org/ns/void#objectsTarget'),
            namedNode(k),
          ),
        );
        store.add(
          quad(
            linkset,
            namedNode('http://rdfs.org/ns/void#triples'),
            literal(v),
          ),
        );
        // Collect multilingual names for default graph
        const terminologySource = catalog.getDatasetByIri(k);
        if (terminologySource) {
          store.addQuads(createNameQuads(terminologySource));
        }
        return store;
      }, new Store()),
    );
  }
}

function createNameQuads(terminologySource: TerminologySource): Quad[] {
  return Object.entries(terminologySource.name).map(([lang, name]) =>
    quad(
      namedNode(terminologySource.iri),
      namedNode('http://purl.org/dc/terms/title'),
      literal(name, lang),
    ),
  );
}
