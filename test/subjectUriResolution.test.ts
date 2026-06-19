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
import {failureReasonFor} from './failures.js';

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
const XSD_BOOLEAN = namedNode('http://www.w3.org/2001/XMLSchema#boolean');

const METRIC_BASE = 'https://def.nde.nl/metric#';
const SAMPLED_METRIC = `${METRIC_BASE}subject-uris-sampled`;
const RESOLVED_METRIC = `${METRIC_BASE}subject-uris-resolved`;
const DURABLE_METRIC = `${METRIC_BASE}subject-namespace-durable`;
const SAMPLING_FAILED_METRIC = `${METRIC_BASE}subject-uris-sampling-failed`;
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

/** Find the `dqv:value` term of the measurement of `metric`, computed on `node`. */
function measurementValueTerm(
  quads: Quad[],
  metric: string,
  node: NamedNode,
): Quad['object'] | undefined {
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
  return quads.find(
    q => q.subject.equals(measurement) && q.predicate.equals(DQV_VALUE),
  )?.object;
}

const SUBJECT_RESOLUTION_FAILURE_BASE =
  'https://def.nde.nl/subject-resolution-failure#';
const PROV_QUALIFIED_USAGE = namedNode(
  'http://www.w3.org/ns/prov#qualifiedUsage',
);

const sampleFixed =
  (uris: string[]): SampleUris =>
  async () =>
    uris;
// `null` means resolved; a non-`good` URI fails with a typed reason.
const resolveByName: ResolveUri = async uri =>
  uri.includes('good') ? null : 'http-error';
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

    // Only the failed sample is enumerated, as a qualified usage carrying its
    // typed reason; the two resolved samples are covered by the count alone.
    expect(
      out.filter(q => q.predicate.equals(PROV_QUALIFIED_USAGE)),
    ).toHaveLength(1);
    expect(failureReasonFor(out, 'http://example.org/id/bad-3')).toBe(
      `${SUBJECT_RESOLUTION_FAILURE_BASE}http-error`,
    );
    expect(
      failureReasonFor(out, 'http://example.org/id/good-1'),
    ).toBeUndefined();
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

  it('excludes a persistently throwing resolution as a transient blip', async () => {
    const ns = subset('http://example.org/id/', 10);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed([
        'http://example.org/id/good',
        'http://example.org/id/throws',
      ]),
      resolve: async uri => {
        if (uri.includes('throws')) throw new Error('boom');
        return null;
      },
      sleep: async () => {},
    });

    const out = await collect(transform(stream(ns.quads), context));

    // The rejection is treated as a transient network-error: retried, then
    // dropped from the denominator rather than dragging the ratio down.
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBe(1);
    expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(1);
    expect(
      failureReasonFor(out, 'http://example.org/id/throws'),
    ).toBeUndefined();
  });

  it('retries a transient failure and counts the eventual success', async () => {
    const ns = subset('http://example.org/id/', 10);
    let attempts = 0;
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed(['http://example.org/id/flaky']),
      // Times out once, then resolves — exactly the crawl-time blip the retry
      // exists to absorb.
      resolve: async () => (attempts++ === 0 ? 'timeout' : null),
      sleep: async () => {},
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(attempts).toBe(2);
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBe(1);
    expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(1);
  });

  it('counts definitive failures while excluding transient ones (Chabot case)', async () => {
    // A healthy ARK dataset where one sample blips transiently and another is
    // genuinely broken: the blip is dropped, the broken one is scored.
    const ns = subset('https://n2t.net/ark:/89268/', 1156);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed([
        'https://n2t.net/ark:/89268/good-1',
        'https://n2t.net/ark:/89268/good-2',
        'https://n2t.net/ark:/89268/blip-3',
        'https://n2t.net/ark:/89268/gone-4',
      ]),
      resolve: async uri => {
        if (uri.includes('good')) return null;
        if (uri.includes('blip')) return 'timeout'; // transient, survives retries
        return 'no-self-reference'; // definitive
      },
      lookupOrg: noOrg,
      sleep: async () => {},
    });

    const out = await collect(transform(stream(ns.quads), context));

    // 3 measurable (2 resolved + 1 definitive failure); the transient blip is
    // excluded from the denominator entirely.
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBe(3);
    expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(2);
    expect(failureReasonFor(out, 'https://n2t.net/ark:/89268/gone-4')).toBe(
      `${SUBJECT_RESOLUTION_FAILURE_BASE}no-self-reference`,
    );
    expect(
      failureReasonFor(out, 'https://n2t.net/ark:/89268/blip-3'),
    ).toBeUndefined();
  });

  it('emits no ratio when every sample is transiently unreachable', async () => {
    const ns = subset('http://example.org/id/', 10);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed([
        'http://example.org/id/a',
        'http://example.org/id/b',
      ]),
      resolve: async () => 'timeout',
      sleep: async () => {},
    });

    const out = await collect(transform(stream(ns.quads), context));

    // Nothing measurable this run: the subsets pass through, no ratio emitted.
    expect(out).toHaveLength(ns.quads.length);
    expect(out.some(q => q.predicate.equals(DQV_HAS_QUALITY_MEASUREMENT))).toBe(
      false,
    );
  });

  it('still declares the PID scheme when every sample is transiently unreachable', async () => {
    // An ARK namespace whose resolver chain is down this run: the declared
    // conformance fact is knowable from the namespace alone, so it survives even
    // though no ratio can be measured.
    const ns = subset('https://n2t.net/ark:/60537/', 312000);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed(['https://n2t.net/ark:/60537/a']),
      resolve: async () => 'timeout',
      lookupOrg: noOrg,
      sleep: async () => {},
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(
      out.some(
        q =>
          q.predicate.equals(DCTERMS_CONFORMS_TO) &&
          q.object.equals(ARK_SCHEME),
      ),
    ).toBe(true);
    // ...but no sampled/resolved ratio, which would be a misleading 0/0.
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
  });

  it('still declares the PID scheme when the sample is empty', async () => {
    const ns = subset('https://n2t.net/ark:/60537/', 312000);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: sampleFixed([]),
      resolve: resolveByName,
      lookupOrg: noOrg,
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(
      out.some(
        q =>
          q.predicate.equals(DCTERMS_CONFORMS_TO) &&
          q.object.equals(ARK_SCHEME),
      ),
    ).toBe(true);
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
  });

  it('keeps the VoID output and marks the failure when sampling fails', async () => {
    const ns = subset('http://example.org/id/', 10);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: async () => {
        throw new Error('endpoint timeout');
      },
      resolve: resolveByName,
      sleep: async () => {},
    });

    const out = await collect(transform(stream(ns.quads), context));

    // The subsets still pass through unchanged...
    for (const original of ns.quads) {
      expect(out.some(q => q.equals(original))).toBe(true);
    }
    // ...and an explicit sampling-failed marker is emitted, so the register can
    // tell this errored sample apart from a namespace that was never sampled.
    expect(
      measurementValueTerm(out, SAMPLING_FAILED_METRIC, ns.node)?.value,
    ).toBe('true');
    // No sampled/resolved ratio, which would be a misleading 0/0.
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
  });

  it('retries the sample query and measures the eventual success', async () => {
    // The sample query times out once, then returns — exactly the crawl-time
    // blip that previously discarded the whole check.
    const ns = subset('http://example.org/id/', 10);
    let attempts = 0;
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: async () => {
        if (attempts++ === 0) throw new Error('endpoint timeout');
        return ['http://example.org/id/good'];
      },
      resolve: resolveByName,
      sleep: async () => {},
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(attempts).toBe(2);
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBe(1);
    expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(1);
    // The retry recovered, so no failure marker.
    expect(
      measurementValueTerm(out, SAMPLING_FAILED_METRIC, ns.node),
    ).toBeUndefined();
  });

  it('still declares the PID scheme and marks the failure when sampling throws', async () => {
    // The bD64Hu case: a healthy ARK dataset whose sample query throws every
    // attempt. The conformance fact is knowable from the namespace alone and
    // must survive, and the failure must leave a marker rather than vanish.
    const ns = subset('https://n2t.net/ark:/60537/', 1552002);
    const transform = subjectUriResolution({
      terminologyPrefixes: [],
      sampleUris: async () => {
        throw new Error('endpoint timeout');
      },
      resolve: resolveByName,
      lookupOrg: noOrg,
      sleep: async () => {},
    });

    const out = await collect(transform(stream(ns.quads), context));

    expect(
      out.some(
        q =>
          q.predicate.equals(DCTERMS_CONFORMS_TO) &&
          q.object.equals(ARK_SCHEME),
      ),
    ).toBe(true);
    expect(
      measurementValueTerm(out, SAMPLING_FAILED_METRIC, ns.node)?.value,
    ).toBe('true');
    expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
  });

  describe('non-durable subject namespaces', () => {
    it('flags a SaaS host hit with subject-namespace-durable = false', async () => {
      const ns = subset('https://collectie.adlibhosting.com/id/', 5000);
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed(['https://collectie.adlibhosting.com/id/good']),
        resolve: resolveByName,
      });

      const out = await collect(transform(stream(ns.quads), context));

      expect(measurementValueTerm(out, DURABLE_METRIC, ns.node)?.value).toBe(
        'false',
      );
    });

    it('matches a subdomain of a disallowed host', async () => {
      const ns = subset('https://cmu.adlibhosting.com/id/', 5000);
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed(['https://cmu.adlibhosting.com/id/good']),
        resolve: resolveByName,
      });

      const out = await collect(transform(stream(ns.quads), context));

      expect(measurementValueTerm(out, DURABLE_METRIC, ns.node)?.value).toBe(
        'false',
      );
    });

    it('does not flag a look-alike host', async () => {
      const ns = subset('https://adlibhosting.com.evil.example/id/', 5000);
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed([
          'https://adlibhosting.com.evil.example/id/good',
        ]),
        resolve: resolveByName,
      });

      const out = await collect(transform(stream(ns.quads), context));

      expect(
        measurementValueTerm(out, DURABLE_METRIC, ns.node),
      ).toBeUndefined();
    });

    it('flags a self-hosted software path fragment', async () => {
      const ns = subset(
        'https://zoeken.geheugenvanzoetermeer.nl/AtlantisPubliek/data/',
        5000,
      );
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed([
          'https://zoeken.geheugenvanzoetermeer.nl/AtlantisPubliek/data/good',
        ]),
        resolve: resolveByName,
      });

      const out = await collect(transform(stream(ns.quads), context));

      expect(measurementValueTerm(out, DURABLE_METRIC, ns.node)?.value).toBe(
        'false',
      );
    });

    it('respects the slash boundary of a path fragment', async () => {
      const ns = subset('https://example.org/AtlantisPubliekX/data/', 5000);
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed([
          'https://example.org/AtlantisPubliekX/data/good',
        ]),
        resolve: resolveByName,
      });

      const out = await collect(transform(stream(ns.quads), context));

      expect(
        measurementValueTerm(out, DURABLE_METRIC, ns.node),
      ).toBeUndefined();
    });

    it('flags the namespace even when sampling fails', async () => {
      const ns = subset('https://collectie.adlibhosting.com/id/', 5000);
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: async () => {
          throw new Error('endpoint timeout');
        },
        resolve: resolveByName,
        sleep: async () => {},
      });

      const out = await collect(transform(stream(ns.quads), context));

      // The durability marker survives a sampling failure...
      expect(measurementValueTerm(out, DURABLE_METRIC, ns.node)?.value).toBe(
        'false',
      );
      // ...while the sampled/resolved measurements are dropped.
      expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
    });

    it('emits no durable measurement for an unflagged namespace', async () => {
      const ns = subset('http://example.org/id/', 5000);
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed(['http://example.org/id/good']),
        resolve: resolveByName,
      });

      const out = await collect(transform(stream(ns.quads), context));

      expect(
        measurementValueTerm(out, DURABLE_METRIC, ns.node),
      ).toBeUndefined();
    });

    it('types the durable value as xsd:boolean', async () => {
      const ns = subset('https://collectie.adlibhosting.com/id/', 5000);
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed(['https://collectie.adlibhosting.com/id/good']),
        resolve: resolveByName,
      });

      const out = await collect(transform(stream(ns.quads), context));

      const value = measurementValueTerm(out, DURABLE_METRIC, ns.node);
      expect(value?.termType).toBe('Literal');
      expect(
        (value as {datatype?: NamedNode} | undefined)?.datatype?.equals(
          XSD_BOOLEAN,
        ),
      ).toBe(true);
    });

    it('co-emits the durable flag alongside a full resolution', async () => {
      // The actual 🟠 scenario: the sample fully resolves, yet the namespace is
      // a known throwaway — both measurements coexist on the subset.
      const ns = subset('https://collectie.adlibhosting.com/id/', 5000);
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed([
          'https://collectie.adlibhosting.com/id/good-1',
          'https://collectie.adlibhosting.com/id/good-2',
        ]),
        resolve: resolveByName,
      });

      const out = await collect(transform(stream(ns.quads), context));

      expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBe(2);
      expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(2);
      expect(measurementValueTerm(out, DURABLE_METRIC, ns.node)?.value).toBe(
        'false',
      );
      // The subset carries all three measurements.
      expect(
        out.filter(
          q =>
            q.subject.equals(ns.node) &&
            q.predicate.equals(DQV_HAS_QUALITY_MEASUREMENT),
        ),
      ).toHaveLength(3);
    });
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

  describe('default resolution classifier', () => {
    afterEach(() => vi.unstubAllGlobals());

    const URI = 'http://example.org/id/x';

    /**
     * Drive the default resolve (no injected `resolve`) over a single URI. A
     * no-op `sleep` keeps the transient-retry backoff from adding real delays.
     */
    async function runWithFetch(fetchImpl: typeof fetch): Promise<Quad[]> {
      vi.stubGlobal('fetch', vi.fn(fetchImpl));
      const ns = subset('http://example.org/id/', 10);
      const transform = subjectUriResolution({
        terminologyPrefixes: [],
        sampleUris: sampleFixed([URI]),
        sleep: async () => {},
      });
      return collect(transform(stream(ns.quads), context));
    }

    function htmlResponse(body: string): Response {
      return new Response(body, {
        status: 200,
        headers: {'content-type': 'text/html'},
      });
    }

    it('excludes a persistently unreachable host as a transient blip', async () => {
      const ns = subset('http://example.org/id/', 10);
      const out = await runWithFetch(async () => {
        throw new Error('ECONNREFUSED');
      });
      // A network error is transient: retried, then dropped from the sample
      // entirely rather than scored as a non-resolution.
      expect(failureReasonFor(out, URI)).toBeUndefined();
      expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
    });

    it('excludes a persistent abort/timeout as a transient blip', async () => {
      const ns = subset('http://example.org/id/', 10);
      const out = await runWithFetch(async () => {
        const error = new Error('aborted');
        error.name = 'TimeoutError';
        throw error;
      });
      expect(failureReasonFor(out, URI)).toBeUndefined();
      expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
    });

    it('excludes a persistent 5xx as a transient blip', async () => {
      const ns = subset('http://example.org/id/', 10);
      const out = await runWithFetch(
        async () => new Response('', {status: 503}),
      );
      expect(failureReasonFor(out, URI)).toBeUndefined();
      expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
    });

    it('excludes a persistent 408 Request Timeout as a transient blip', async () => {
      // A 408 is a transient 4xx — a proxy cutting a slow upstream — so it must
      // be retried and excluded, not scored as a definitive non-resolution.
      const ns = subset('http://example.org/id/', 10);
      const out = await runWithFetch(
        async () => new Response('', {status: 408}),
      );
      expect(failureReasonFor(out, URI)).toBeUndefined();
      expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
    });

    it('classifies a definitive non-2xx response as http-error', async () => {
      const ns = subset('http://example.org/id/', 10);
      const out = await runWithFetch(
        async () => new Response('', {status: 404}),
      );
      // A 404 is definitive: counted against the ratio and persisted.
      expect(failureReasonFor(out, URI)).toBe(
        `${SUBJECT_RESOLUTION_FAILURE_BASE}http-error`,
      );
      expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBe(1);
    });

    it('classifies a non-HTML content type as wrong-content-type', async () => {
      const out = await runWithFetch(
        async () =>
          new Response('{}', {
            status: 200,
            headers: {'content-type': 'application/json'},
          }),
      );
      expect(failureReasonFor(out, URI)).toBe(
        `${SUBJECT_RESOLUTION_FAILURE_BASE}wrong-content-type`,
      );
    });

    it('classifies HTML without a self-reference as no-self-reference', async () => {
      const out = await runWithFetch(async () =>
        htmlResponse('<html>no link here</html>'),
      );
      expect(failureReasonFor(out, URI)).toBe(
        `${SUBJECT_RESOLUTION_FAILURE_BASE}no-self-reference`,
      );
    });

    it('excludes an unreadable body as a transient blip', async () => {
      const ns = subset('http://example.org/id/', 10);
      const out = await runWithFetch(
        async () =>
          ({
            ok: true,
            headers: {get: () => 'text/html'},
            text: async () => {
              throw new Error('stream closed');
            },
          }) as unknown as Response,
      );
      // A `200 text/html` whose body cannot be read is a transport failure
      // (network-error): retried, then excluded rather than scored.
      expect(failureReasonFor(out, URI)).toBeUndefined();
      expect(measurementValue(out, SAMPLED_METRIC, ns.node)).toBeUndefined();
    });

    it('reports a resolving, self-referencing page as resolved', async () => {
      const ns = subset('http://example.org/id/', 10);
      const out = await runWithFetch(async () =>
        htmlResponse(`<html><a href="${URI}">permalink</a></html>`),
      );
      expect(measurementValue(out, RESOLVED_METRIC, ns.node)).toBe(1);
      expect(failureReasonFor(out, URI)).toBeUndefined();
      expect(out.some(q => q.predicate.equals(PROV_QUALIFIED_USAGE))).toBe(
        false,
      );
    });
  });
});
