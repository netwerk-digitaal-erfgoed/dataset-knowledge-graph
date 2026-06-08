import {afterEach, describe, expect, it, vi} from 'vitest';
import {DataFactory} from 'n3';
import type {NamedNode, Quad} from '@rdfjs/types';
import {Dataset, Distribution} from '@lde/dataset';
import type {ExecutorContext} from '@lde/pipeline';
import {
  subjectUriResolution,
  type LookupOrg,
  type ResolveUri,
  type SampleUris,
} from '../src/subjectUriResolution.js';

const {namedNode, literal, quad} = DataFactory;

const DATASET_IRI = 'http://example.org/dataset/1';

const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const VOID_DATASET = namedNode('http://rdfs.org/ns/void#Dataset');
const VOID_SUBSET = namedNode('http://rdfs.org/ns/void#subset');
const VOID_URI_SPACE = namedNode('http://rdfs.org/ns/void#uriSpace');
const VOID_ENTITIES = namedNode('http://rdfs.org/ns/void#entities');
const DCTERMS_CONFORMS_TO = namedNode('http://purl.org/dc/terms/conformsTo');
const DCTERMS_PUBLISHER = namedNode('http://purl.org/dc/terms/publisher');
const DQV_HAS_QUALITY_MEASUREMENT = namedNode(
  'http://www.w3.org/ns/dqv#hasQualityMeasurement',
);
const DQV_COMPUTED_ON = namedNode('http://www.w3.org/ns/dqv#computedOn');
const DQV_IS_MEASUREMENT_OF = namedNode(
  'http://www.w3.org/ns/dqv#isMeasurementOf',
);
const DQV_VALUE = namedNode('http://www.w3.org/ns/dqv#value');
const XSD_INTEGER = namedNode('http://www.w3.org/2001/XMLSchema#integer');

const METRIC_BASE = 'https://def.nde.nl/metric#';
const SAMPLED_METRIC = `${METRIC_BASE}subject-uris-sampled`;
const RESOLVED_METRIC = `${METRIC_BASE}subject-uris-resolved`;
const ARK_SCHEME = namedNode('https://def.nde.nl/pid-scheme#ark');
const HANDLE_SCHEME = namedNode('https://def.nde.nl/pid-scheme#handle');

const dataset = new Dataset({iri: new URL(DATASET_IRI), distributions: []});
const distribution = Distribution.sparql(new URL('http://example.org/sparql'));
const context: ExecutorContext = {
  dataset,
  distribution,
  stage: 'subject-uri-space.rq',
};

/** Build the subset quads `subject-uri-space.rq` emits for one namespace. */
function subset(
  uriSpace: string,
  entities: number,
): {node: NamedNode; quads: Quad[]} {
  const node = namedNode(
    `${DATASET_IRI}/.well-known/void#subject-uri-space-${encodeURIComponent(uriSpace)}`,
  );
  return {
    node,
    quads: [
      quad(namedNode(DATASET_IRI), RDF_TYPE, VOID_DATASET),
      quad(namedNode(DATASET_IRI), VOID_SUBSET, node),
      quad(node, VOID_URI_SPACE, literal(uriSpace)),
      quad(node, VOID_ENTITIES, literal(String(entities), XSD_INTEGER)),
    ],
  };
}

function stream(quads: Quad[]): AsyncIterable<Quad> {
  return (async function* () {
    for (const q of quads) yield q;
  })();
}

async function collect(quads: AsyncIterable<Quad>): Promise<Quad[]> {
  const result: Quad[] = [];
  for await (const q of quads) result.push(q);
  return result;
}

/** Read the integer value of the measurement of `metric`, computed on `node`. */
function measurementValue(
  quads: Quad[],
  metric: string,
  node: NamedNode,
): number | undefined {
  const measurement = quads.find(
    q => q.predicate.equals(DQV_IS_MEASUREMENT_OF) && q.object.value === metric,
  )?.subject;
  if (!measurement) return undefined;
  const onNode = quads.some(
    q =>
      q.subject.equals(measurement) &&
      q.predicate.equals(DQV_COMPUTED_ON) &&
      q.object.equals(node),
  );
  if (!onNode) return undefined;
  const value = quads.find(
    q => q.subject.equals(measurement) && q.predicate.equals(DQV_VALUE),
  );
  return value ? Number(value.object.value) : undefined;
}

const sampleFixed =
  (uris: string[]): SampleUris =>
  async () =>
    uris;
const resolveByName: ResolveUri = async uri => uri.includes('good');
const noOrg: LookupOrg = async () => undefined;

describe('subjectUriResolution', () => {
  it('passes the subsets through and appends sampled/resolved measurements', async () => {
    const ns = subset('http://example.org/id/', 312000);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed([
        'http://example.org/id/good-1',
        'http://example.org/id/good-2',
        'http://example.org/id/bad-3',
      ]),
      resolve: resolveByName,
    });

    const out = await collect(transform(stream(ns.quads), context));

    // The subset quads survive unchanged.
    expect(
      out.some(q => q.predicate.equals(VOID_URI_SPACE)) &&
        out.some(q => q.predicate.equals(VOID_ENTITIES)),
    ).toBe(true);

    // Measurements are computed on the subset node, not the dataset.
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBe(3);
    expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(2);
    expect(
      out.filter(
        q =>
          q.subject.equals(ns.node) &&
          q.predicate.equals(DQV_HAS_QUALITY_MEASUREMENT),
      ),
    ).toHaveLength(2);
  });

  it('picks the most common non-terminology namespace', async () => {
    const terminology = subset('http://data.rkd.nl/artists/', 900000);
    const own = subset('http://example.org/id/', 5000);
    const seen: string[] = [];
    const transform = subjectUriResolution({
      terminologyPrefixes: ['http://data.rkd.nl/artists/'],
      sampleUris: async uriSpace => {
        seen.push(uriSpace);
        return [];
      },
      resolve: resolveByName,
    });

    await collect(
      transform(stream([...terminology.quads, ...own.quads]), context),
    );

    // The bigger terminology namespace is skipped; the dataset’s own one wins.
    expect(seen).toEqual(['http://example.org/id/']);
  });

  it('emits nothing extra when only terminology namespaces survive', async () => {
    const terminology = subset('http://data.rkd.nl/artists/', 900000);
    const transform = subjectUriResolution({
      terminologyPrefixes: ['http://data.rkd.nl/artists/'],
      sampleUris: sampleFixed(['http://data.rkd.nl/artists/1']),
      resolve: resolveByName,
    });

    const out = await collect(transform(stream(terminology.quads), context));

    expect(out).toHaveLength(terminology.quads.length);
    expect(out.some(q => q.predicate.equals(DQV_HAS_QUALITY_MEASUREMENT))).toBe(
      false,
    );
  });

  it('detects an ARK scheme and attaches the issuing organisation', async () => {
    const ns = subset('https://n2t.net/ark:/60537/', 312000);
    const lookupOrg: LookupOrg = async naan =>
      naan === '60537' ? 'Gouda Tijdmachine' : undefined;
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed(['https://n2t.net/ark:/60537/good-1']),
      resolve: resolveByName,
      lookupOrg,
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(
      out.some(
        q =>
          q.subject.equals(ns.node) &&
          q.predicate.equals(DCTERMS_CONFORMS_TO) &&
          q.object.equals(ARK_SCHEME),
      ),
    ).toBe(true);
    expect(
      out.some(
        q =>
          q.subject.equals(ns.node) &&
          q.predicate.equals(DCTERMS_PUBLISHER) &&
          q.object.value === 'Gouda Tijdmachine',
      ),
    ).toBe(true);
  });

  it('detects a Handle scheme but attaches no organisation', async () => {
    const ns = subset('http://hdl.handle.net/21.12102/', 100);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed(['http://hdl.handle.net/21.12102/good']),
      resolve: resolveByName,
      lookupOrg: noOrg,
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(
      out.some(
        q =>
          q.predicate.equals(DCTERMS_CONFORMS_TO) &&
          q.object.equals(HANDLE_SCHEME),
      ),
    ).toBe(true);
    expect(out.some(q => q.predicate.equals(DCTERMS_PUBLISHER))).toBe(false);
  });

  it('does not classify a look-alike host as a Handle scheme', async () => {
    // The host merely starts with 'hdl.handle.net' — the trailing-slash
    // boundary must stop it from matching the Handle prefix.
    const ns = subset('https://hdl.handle.net.evil.example/123/', 50);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed(['https://hdl.handle.net.evil.example/123/good']),
      resolve: resolveByName,
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(out.some(q => q.predicate.equals(DCTERMS_CONFORMS_TO))).toBe(false);
    // The resolution measurement is still emitted for the namespace.
    expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(1);
  });

  it('measures an unrecognised namespace without a scheme or org', async () => {
    const ns = subset('http://example.org/id/', 42);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed(['http://example.org/id/good']),
      resolve: resolveByName,
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(1);
    expect(out.some(q => q.predicate.equals(DCTERMS_CONFORMS_TO))).toBe(false);
    expect(out.some(q => q.predicate.equals(DCTERMS_PUBLISHER))).toBe(false);
  });

  it('emits the ARK scheme without an org when the lookup fails', async () => {
    const ns = subset('https://n2t.net/ark:/60537/', 10);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed(['https://n2t.net/ark:/60537/good']),
      resolve: resolveByName,
      lookupOrg: async () => {
        throw new Error('arks.org unreachable');
      },
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(out.some(q => q.object.equals(ARK_SCHEME))).toBe(true);
    expect(out.some(q => q.predicate.equals(DCTERMS_PUBLISHER))).toBe(false);
    // The measurements are still emitted.
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBe(1);
  });

  it('counts a resolution that throws as unresolved', async () => {
    const ns = subset('http://example.org/id/', 10);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed([
        'http://example.org/id/good',
        'http://example.org/id/throws',
      ]),
      resolve: async uri => {
        if (uri.includes('throws')) throw new Error('boom');
        return true;
      },
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBe(2);
    expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(1);
  });

  it('keeps the VoID output when sampling fails', async () => {
    const ns = subset('http://example.org/id/', 10);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: async () => {
        throw new Error('endpoint timeout');
      },
      resolve: resolveByName,
    });

    const out = await collect(transform(stream(ns.quads), context));

    // The subsets pass through; no measurements are appended.
    expect(out).toHaveLength(ns.quads.length);
    expect(out.some(q => q.predicate.equals(DQV_HAS_QUALITY_MEASUREMENT))).toBe(
      false,
    );
  });

  describe('default ARK organisation lookup', () => {
    afterEach(() => vi.unstubAllGlobals());

    // The arks.org NAAN record nests the organisation under `properties.who`.
    const arksRecord = {
      pid: 'ark:60537',
      properties: {who: {name: 'Gouda Tijdmachine', acronym: 'GTM'}},
    };

    it('reads properties.who.name from the arks.org record', async () => {
      const fetchStub = vi.fn(
        async () =>
          new Response(JSON.stringify(arksRecord), {
            status: 200,
            headers: {'content-type': 'application/json'},
          }),
      );
      vi.stubGlobal('fetch', fetchStub);

      const ns = subset('https://n2t.net/ark:/60537/', 10);
      // lookupOrg left to the default → exercises the arks.org parsing.
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed(['https://n2t.net/ark:/60537/good']),
        resolve: resolveByName,
      });

      const out = await collect(transform(stream(ns.quads), context));

      expect(fetchStub).toHaveBeenCalledWith(
        'https://arks.org/ark:60537',
        expect.anything(),
      );
      expect(
        out.some(
          q =>
            q.predicate.equals(DCTERMS_PUBLISHER) &&
            q.object.value === 'Gouda Tijdmachine',
        ),
      ).toBe(true);
    });
  });
});
