import {describe, it, expect, beforeAll} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {DataFactory, Parser, Store} from 'n3';
import type {Quad} from '@rdfjs/types';
import {QueryEngine} from '@comunica/query-sparql-rdfjs-lite';
import {iiifStage} from '../src/iiifStage.js';
import {Stage} from '@lde/pipeline';

const {namedNode} = DataFactory;

const VOID_SUBSET = namedNode('http://rdfs.org/ns/void#subset');
const VOID_ENTITIES = namedNode('http://rdfs.org/ns/void#entities');
const DCTERMS_CONFORMS_TO = namedNode('http://purl.org/dc/terms/conformsTo');
const IIIF_PRESENTATION = namedNode('http://iiif.io/api/presentation/');
const MANIFEST_SAMPLE = namedNode('https://def.nde.nl/iiif#manifest-sample');
const XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';

const DATASET_IRI = 'http://example.org/dataset/1';
const EXPECTED_SUBSET_IRI =
  DATASET_IRI +
  '/.well-known/void#iiif-' +
  createHash('md5').update('http://iiif.io/api/presentation/').digest('hex');

const queryPath = resolve(
  new URL('../queries/analysis/iiif.rq', import.meta.url).pathname,
);

const PREFIXES = `
@prefix schema: <http://schema.org/> .
@prefix iana: <https://www.iana.org/assignments/media-types/> .
`;

let queryTemplate: string;

beforeAll(async () => {
  queryTemplate = (await readFile(queryPath)).toString();
});

function buildQuery(subjectFilter = '', limit = 10): string {
  // Mirror iiifStage's and SparqlConstructExecutor's substitutions: the
  // #limit# sample cap (threaded by iiifStage), the subjectFilter pattern,
  // and ?dataset → the dataset IRI literal.
  return queryTemplate
    .replaceAll('#limit#', String(limit))
    .replaceAll('#subjectFilter#', subjectFilter)
    .replaceAll('?dataset', `<${DATASET_IRI}>`);
}

async function runQueryOn(
  turtle: string,
  subjectFilter = '',
  limit = 10,
): Promise<Quad[]> {
  const store = new Store();
  const parser = new Parser();
  store.addQuads(parser.parse(PREFIXES + turtle));

  const engine = new QueryEngine();
  const stream = await engine.queryQuads(buildQuery(subjectFilter, limit), {
    sources: [store],
  });
  // CONSTRUCT is set-semantics, but the cross-join of the COUNT and sample
  // sub-selects makes the engine's stream repeat the constant triples once per
  // sampled row. Production collapses these via the executor's `deduplicate`
  // option; mirror that here so the test asserts the query's logical graph.
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

function findSampleManifests(quads: Quad[], subset: string): string[] {
  return quads
    .filter(
      q => q.subject.value === subset && q.predicate.equals(MANIFEST_SAMPLE),
    )
    .map(q => q.object.value);
}

function findSubsetIri(quads: Quad[]): string | undefined {
  return quads.find(
    q => q.subject.value === DATASET_IRI && q.predicate.equals(VOID_SUBSET),
  )?.object.value;
}

function findEntitiesCount(quads: Quad[], subset: string): number | undefined {
  const entities = quads.find(
    q => q.subject.value === subset && q.predicate.equals(VOID_ENTITIES),
  );
  return entities ? Number(entities.object.value) : undefined;
}

describe('iiifStage', () => {
  it('returns a Stage named iiif.rq', async () => {
    const stage = await iiifStage();
    expect(stage).toBeInstanceOf(Stage);
    expect(stage.name).toBe('iiif.rq');
  });
});

describe('iiif.rq detection query', () => {
  it('emits one subset with the expected count for v3 manifests', async () => {
    const turtle = `
      <http://example.org/work/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
      <http://example.org/work/2> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
    `;

    const quads = await runQueryOn(turtle);

    const subsetIri = findSubsetIri(quads);
    expect(subsetIri).toBe(EXPECTED_SUBSET_IRI);
    expect(findEntitiesCount(quads, subsetIri!)).toBe(2);

    // dcterms:conformsTo points to the version-less IIIF Presentation namespace.
    const conformsTo = quads.find(
      q =>
        q.subject.value === subsetIri &&
        q.predicate.equals(DCTERMS_CONFORMS_TO),
    );
    expect(conformsTo?.object.equals(IIIF_PRESENTATION)).toBe(true);

    // void:entities is typed xsd:integer.
    const entities = quads.find(
      q => q.subject.value === subsetIri && q.predicate.equals(VOID_ENTITIES),
    );
    expect(entities?.object.termType).toBe('Literal');
    expect(
      (entities?.object as {datatype: {value: string}}).datatype.value,
    ).toBe(XSD_INTEGER);
  });

  it('detects v2 manifests', async () => {
    const turtle = `
      <http://example.org/work/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/2/context.json'" .
    `;

    const quads = await runQueryOn(turtle);

    const subsetIri = findSubsetIri(quads);
    expect(subsetIri).toBeDefined();
    expect(findEntitiesCount(quads, subsetIri!)).toBe(1);
  });

  it('collapses v2 and v3 into a single subset whose count is distinct manifests across versions', async () => {
    const turtle = `
      <http://example.org/work/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/2/context.json'" .
      <http://example.org/work/2> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
      <http://example.org/work/3> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
    `;

    const quads = await runQueryOn(turtle);

    const subsetIris = quads
      .filter(
        q => q.subject.value === DATASET_IRI && q.predicate.equals(VOID_SUBSET),
      )
      .map(q => q.object.value);

    expect(subsetIris).toHaveLength(1);
    expect(findEntitiesCount(quads, subsetIris[0])).toBe(3);
  });

  it('matches a hypothetical IIIF Presentation v4 manifest (forwards-compatible version segment)', async () => {
    const turtle = `
      <http://example.org/work/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/4/context.json'" .
    `;

    const quads = await runQueryOn(turtle);

    const subsetIri = findSubsetIri(quads);
    expect(subsetIri).toBeDefined();
    expect(findEntitiesCount(quads, subsetIri!)).toBe(1);
  });

  it('matches any version segment, not only numeric ones (deliberate forwards-compatibility)', async () => {
    // The detection avoids REGEX for performance and so no longer constrains the
    // version segment to digits. A non-numeric segment is matched too; in practice
    // the IIIF profile segment is always a version number, so this is acceptable.
    const turtle = `
      <http://example.org/work/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/beta/context.json'" .
    `;

    const quads = await runQueryOn(turtle);

    const subsetIri = findSubsetIri(quads);
    expect(subsetIri).toBeDefined();
    expect(findEntitiesCount(quads, subsetIri!)).toBe(1);
  });

  it('counts each manifest once even when reached via multiple paths', async () => {
    const turtle = `
      <http://example.org/work/1> schema:associatedMedia <http://example.org/manifest/1> .
      <http://example.org/work/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
      <http://example.org/manifest/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
    `;

    const quads = await runQueryOn(turtle);

    const subsetIri = findSubsetIri(quads);
    expect(subsetIri).toBeDefined();
    // Two distinct manifest resources, both carrying the encodingFormat literal.
    expect(findEntitiesCount(quads, subsetIri!)).toBe(2);
  });

  it('emits nothing when there are no IIIF manifests', async () => {
    const turtle = `
      <http://example.org/work/1> schema:encodingFormat "image/jpeg" .
      <http://example.org/work/2> schema:encodingFormat "application/pdf" .
    `;

    const quads = await runQueryOn(turtle);
    expect(quads).toHaveLength(0);
  });

  it('does not match near-miss encodingFormat literals', async () => {
    const turtle = `
      # Different profile URL.
      <http://example.org/work/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/image/3/context.json'" .
      # Missing the trailing context.json segment.
      <http://example.org/work/2> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/'" .
      # Malformed: no quotes around the profile URL.
      <http://example.org/work/3> schema:encodingFormat
        "application/ld+json;profile=http://iiif.io/api/presentation/3/context.json" .
      # Extra trailing characters.
      <http://example.org/work/4> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json' charset=utf-8" .
    `;

    const quads = await runQueryOn(turtle);
    expect(quads).toHaveLength(0);
  });

  it('detects manifests published under https://schema.org/encodingFormat', async () => {
    const turtle = `
      <http://example.org/work/1> <https://schema.org/encodingFormat>
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
      <http://example.org/work/2> <https://schema.org/encodingFormat>
        "application/ld+json;profile='http://iiif.io/api/presentation/2/context.json'" .
    `;

    const quads = await runQueryOn(turtle);

    const subsetIri = findSubsetIri(quads);
    expect(subsetIri).toBeDefined();
    expect(findEntitiesCount(quads, subsetIri!)).toBe(2);
  });

  it('emits a sample of the matched manifest IRIs alongside the declared count', async () => {
    const turtle = `
      <http://example.org/work/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
      <http://example.org/work/2> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
    `;

    const quads = await runQueryOn(turtle);

    const subsetIri = findSubsetIri(quads);
    expect(subsetIri).toBeDefined();
    // Declared count is preserved unchanged.
    expect(findEntitiesCount(quads, subsetIri!)).toBe(2);
    // Every matched manifest is sampled (count ≤ limit).
    expect(findSampleManifests(quads, subsetIri!).sort()).toEqual([
      'http://example.org/work/1',
      'http://example.org/work/2',
    ]);
  });

  it('caps the manifest sample at the configured limit', async () => {
    const turtle = `
      <http://example.org/work/1> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
      <http://example.org/work/2> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
      <http://example.org/work/3> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
    `;

    const quads = await runQueryOn(turtle, '', 2);

    const subsetIri = findSubsetIri(quads);
    expect(subsetIri).toBeDefined();
    // The declared count covers all three manifests …
    expect(findEntitiesCount(quads, subsetIri!)).toBe(3);
    // … but only two are sampled, and each is one of the matched manifests.
    const sampled = findSampleManifests(quads, subsetIri!);
    expect(sampled).toHaveLength(2);
    for (const manifest of sampled) {
      expect([
        'http://example.org/work/1',
        'http://example.org/work/2',
        'http://example.org/work/3',
      ]).toContain(manifest);
    }
  });

  it('honours the subjectFilter, scoping the count to the dataset', async () => {
    // Two manifests inside the dataset, one outside. The subject filter is a
    // graph pattern on ?s (the same convention subjectFilters.ts uses) so only
    // the in-dataset manifests should be counted.
    const turtle = `
      <http://example.org/work/1> schema:isPartOf <${DATASET_IRI}> ;
        schema:encodingFormat
          "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
      <http://example.org/work/2> schema:isPartOf <${DATASET_IRI}> ;
        schema:encodingFormat
          "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
      <http://example.org/work/3> schema:isPartOf <http://example.org/dataset/other> ;
        schema:encodingFormat
          "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'" .
    `;

    // Production subject filters (subjectFilters.ts) use full IRIs, not
    // PREFIX-bound shortcuts — so the pattern is independent of which
    // schema.org namespace the query template declares.
    const subjectFilter = `?s <http://schema.org/isPartOf> <${DATASET_IRI}>.`;
    const quads = await runQueryOn(turtle, subjectFilter);

    const subsetIri = findSubsetIri(quads);
    expect(subsetIri).toBeDefined();
    expect(findEntitiesCount(quads, subsetIri!)).toBe(2);
  });
});
