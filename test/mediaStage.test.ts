import {describe, it, expect, beforeAll} from 'vitest';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {DataFactory, Parser, Store} from 'n3';
import type {Quad} from '@rdfjs/types';
import {QueryEngine} from '@comunica/query-sparql-rdfjs-lite';
import {Dataset, Distribution} from '@lde/dataset';
import {NotSupported, Stage, type Reader} from '@lde/pipeline';
import {mediaStage, MediaSubsetReader} from '../src/mediaStage.js';

const {namedNode, literal, quad} = DataFactory;

const VOID_SUBSET = namedNode('http://rdfs.org/ns/void#subset');
const VOID_ENTITIES = namedNode('http://rdfs.org/ns/void#entities');
const VOID_PROPERTY_PARTITION = namedNode(
  'http://rdfs.org/ns/void#propertyPartition',
);
const VOID_PROPERTY = namedNode('http://rdfs.org/ns/void#property');
const PROBE_DETECTS = namedNode('https://def.nde.nl/probe#detects');
const PROBE_MEDIA = namedNode('https://def.nde.nl/probe#media');
const XSD_INTEGER = namedNode('http://www.w3.org/2001/XMLSchema#integer');

const DATASET_IRI = 'http://example.org/dataset/1';
const MEDIA_SUBSET_IRI = DATASET_IRI + '/.well-known/void#media';

const queryPath = resolve(
  new URL('../queries/analysis/media.rq', import.meta.url).pathname,
);

let queryTemplate: string;
beforeAll(async () => {
  queryTemplate = (await readFile(queryPath)).toString();
});

function buildQuery(subjectFilter = ''): string {
  return queryTemplate
    .replaceAll('#subjectFilter#', subjectFilter)
    .replaceAll('?dataset', `<${DATASET_IRI}>`);
}

async function runQueryOn(turtle: string, subjectFilter = ''): Promise<Quad[]> {
  const store = new Store();
  store.addQuads(new Parser().parse(turtle));
  const engine = new QueryEngine();
  const stream = await engine.queryQuads(buildQuery(subjectFilter), {
    sources: [store],
  });
  const seen = new Set<string>();
  const quads: Quad[] = [];
  for await (const q of stream) {
    const key = `${q.subject.value}|${q.predicate.value}|${q.object.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      quads.push(q);
    }
  }
  return quads;
}

function propertyPartitionCounts(quads: Quad[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const partition of quads.filter(q =>
    q.predicate.equals(VOID_PROPERTY_PARTITION),
  )) {
    const node = partition.object;
    const property = quads.find(
      q => q.subject.equals(node) && q.predicate.equals(VOID_PROPERTY),
    )?.object.value;
    const entities = quads.find(
      q => q.subject.equals(node) && q.predicate.equals(VOID_ENTITIES),
    )?.object.value;
    if (property && entities) counts.set(property, Number(entities));
  }
  return counts;
}

describe('mediaStage', () => {
  it('returns a Stage named media.rq', async () => {
    const stage = await mediaStage();
    expect(stage).toBeInstanceOf(Stage);
    expect(stage.name).toBe('media.rq');
  });
});

describe('media.rq detection query', () => {
  it('emits a marked media subset with one partition per media predicate', async () => {
    const turtle = `
      <http://example.org/record/1> <http://schema.org/image> <http://example.org/img/1> .
      <http://example.org/record/2> <http://schema.org/image> <http://example.org/img/2> .
      <http://example.org/record/1> <http://schema.org/contentUrl> <http://example.org/cu/1> .
    `;

    const quads = await runQueryOn(turtle);

    // The dataset points at the deterministic media subset IRI …
    const subset = quads.find(
      q => q.subject.value === DATASET_IRI && q.predicate.equals(VOID_SUBSET),
    );
    expect(subset?.object.value).toBe(MEDIA_SUBSET_IRI);

    // … which carries the probe marker …
    expect(
      quads.some(
        q =>
          q.subject.value === MEDIA_SUBSET_IRI &&
          q.predicate.equals(PROBE_DETECTS) &&
          q.object.equals(PROBE_MEDIA),
      ),
    ).toBe(true);

    // … and a self-describing partition per present predicate.
    const counts = propertyPartitionCounts(quads);
    expect(counts.get('http://schema.org/image')).toBe(2);
    expect(counts.get('http://schema.org/contentUrl')).toBe(1);
  });

  it('detects media expressed only in EDM (no schema.org media)', async () => {
    const turtle = `
      <http://example.org/record/1>
        <http://www.europeana.eu/schemas/edm/isShownBy> <http://example.org/img/1> .
    `;

    const quads = await runQueryOn(turtle);

    expect(
      quads.some(
        q => q.predicate.equals(PROBE_DETECTS) && q.object.equals(PROBE_MEDIA),
      ),
    ).toBe(true);
    expect(
      propertyPartitionCounts(quads).get(
        'http://www.europeana.eu/schemas/edm/isShownBy',
      ),
    ).toBe(1);
  });

  it('counts schema:encodingFormat as media, so every IIIF manifest is also media (iiif ⊆ media)', async () => {
    const turtle = `
      <http://example.org/manifest/1> <http://schema.org/encodingFormat> "application/ld+json" .
    `;

    const quads = await runQueryOn(turtle);

    expect(
      quads.some(
        q => q.predicate.equals(PROBE_DETECTS) && q.object.equals(PROBE_MEDIA),
      ),
    ).toBe(true);
    expect(
      propertyPartitionCounts(quads).get('http://schema.org/encodingFormat'),
    ).toBe(1);
  });

  it('emits nothing for a dataset without media', async () => {
    const turtle = `
      <http://example.org/record/1> <http://schema.org/name> "A record" .
      <http://example.org/record/1> <http://schema.org/depicts> <http://example.org/subject/1> .
    `;

    const quads = await runQueryOn(turtle);
    expect(quads).toHaveLength(0);
  });
});

const dataset = new Dataset({iri: new URL(DATASET_IRI), distributions: []});
const distribution = Distribution.sparql(new URL('http://example.org/sparql'));

function innerYielding(quads: Quad[]): Reader {
  return {
    async read() {
      return (async function* () {
        for (const q of quads) yield q;
      })();
    },
  };
}

async function collect(
  result: AsyncIterable<Quad> | NotSupported,
): Promise<Quad[]> {
  if (result instanceof NotSupported) throw new Error('unexpected');
  const quads: Quad[] = [];
  for await (const q of result) quads.push(q);
  return quads;
}

/** A marked media subset with two property partitions of the given counts. */
function subsetWithPartitions(...counts: number[]): Quad[] {
  const subset = namedNode(MEDIA_SUBSET_IRI);
  const quads: Quad[] = [
    quad(namedNode(DATASET_IRI), VOID_SUBSET, subset),
    quad(subset, PROBE_DETECTS, PROBE_MEDIA),
  ];
  counts.forEach((count, index) => {
    const partition = namedNode(`http://example.org/partition/${index}`);
    quads.push(quad(subset, VOID_PROPERTY_PARTITION, partition));
    quads.push(
      quad(partition, VOID_ENTITIES, literal(String(count), XSD_INTEGER)),
    );
  });
  return quads;
}

describe('MediaSubsetReader', () => {
  it('sets the subset void:entities to the MAX over partition counts (not the sum)', async () => {
    const executor = new MediaSubsetReader(
      innerYielding(subsetWithPartitions(1, 2, 1)),
    );
    const out = await collect(await executor.read(dataset, distribution));

    const entities = out.find(
      q =>
        q.subject.value === MEDIA_SUBSET_IRI &&
        q.predicate.equals(VOID_ENTITIES),
    );
    expect(entities).toBeDefined();
    expect(Number(entities!.object.value)).toBe(2);
    expect(
      (entities!.object as {datatype: {value: string}}).datatype.value,
    ).toBe(XSD_INTEGER.value);
  });

  it('passes the partition triples through unchanged', async () => {
    const input = subsetWithPartitions(3);
    const executor = new MediaSubsetReader(innerYielding(input));
    const out = await collect(await executor.read(dataset, distribution));

    for (const q of input) {
      expect(out.some(o => o.equals(q))).toBe(true);
    }
  });

  it('emits nothing extra when the dataset has no media subset', async () => {
    const executor = new MediaSubsetReader(
      innerYielding([
        quad(namedNode(DATASET_IRI), VOID_SUBSET, namedNode('x')),
      ]),
    );
    const out = await collect(await executor.read(dataset, distribution));
    expect(out.some(q => q.predicate.equals(VOID_ENTITIES))).toBe(false);
  });

  it('passes NotSupported through', async () => {
    const inner: Reader = {
      async read() {
        return new NotSupported('no distribution');
      },
    };
    const result = await new MediaSubsetReader(inner).read(
      dataset,
      distribution,
    );
    expect(result).toBeInstanceOf(NotSupported);
  });
});
