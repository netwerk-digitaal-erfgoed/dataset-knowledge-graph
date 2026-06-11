import {DataFactory} from 'n3';
import pLimit from 'p-limit';
import {SparqlEndpointFetcher, type IBindings} from 'fetch-sparql-endpoint';
import type {Quad} from '@rdfjs/types';
import {assertSafeIri, type Dataset, type Distribution} from '@lde/dataset';
import type {ExecutorContext, QuadTransform} from '@lde/pipeline';

const {namedNode, literal, blankNode, quad} = DataFactory;

const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const VOID_URI_SPACE = namedNode('http://rdfs.org/ns/void#uriSpace');
const VOID_ENTITIES = namedNode('http://rdfs.org/ns/void#entities');
const DCTERMS_CONFORMS_TO = namedNode('http://purl.org/dc/terms/conformsTo');
const DCTERMS_PUBLISHER = namedNode('http://purl.org/dc/terms/publisher');
const DQV_HAS_QUALITY_MEASUREMENT = namedNode(
  'http://www.w3.org/ns/dqv#hasQualityMeasurement',
);
const DQV_QUALITY_MEASUREMENT = namedNode(
  'http://www.w3.org/ns/dqv#QualityMeasurement',
);
const DQV_COMPUTED_ON = namedNode('http://www.w3.org/ns/dqv#computedOn');
const DQV_IS_MEASUREMENT_OF = namedNode(
  'http://www.w3.org/ns/dqv#isMeasurementOf',
);
const DQV_VALUE = namedNode('http://www.w3.org/ns/dqv#value');
const PROV_ACTIVITY = namedNode('http://www.w3.org/ns/prov#Activity');
const PROV_USED = namedNode('http://www.w3.org/ns/prov#used');
const PROV_WAS_ASSOCIATED_WITH = namedNode(
  'http://www.w3.org/ns/prov#wasAssociatedWith',
);
const PROV_WAS_GENERATED_BY = namedNode(
  'http://www.w3.org/ns/prov#wasGeneratedBy',
);
const XSD_INTEGER = namedNode('http://www.w3.org/2001/XMLSchema#integer');
const XSD_BOOLEAN = namedNode('http://www.w3.org/2001/XMLSchema#boolean');

const METRIC_BASE = 'https://def.nde.nl/metric#';
const SUBJECT_URIS_SAMPLED_METRIC = namedNode(
  `${METRIC_BASE}subject-uris-sampled`,
);
const SUBJECT_URIS_RESOLVED_METRIC = namedNode(
  `${METRIC_BASE}subject-uris-resolved`,
);
const SUBJECT_NAMESPACE_DURABLE_METRIC = namedNode(
  `${METRIC_BASE}subject-namespace-durable`,
);

const PID_SCHEME_BASE = 'https://def.nde.nl/pid-scheme#';
const PID_SCHEMES = {
  ark: namedNode(`${PID_SCHEME_BASE}ark`),
  handle: namedNode(`${PID_SCHEME_BASE}handle`),
} as const;
type PidScheme = keyof typeof PID_SCHEMES;

/**
 * Host+path prefixes identifying a PID scheme, tolerant of `http`/`https` and
 * known resolver hosts. At most one scheme is assigned per namespace.
 */
const PID_PREFIXES: ReadonlyArray<{scheme: PidScheme; prefix: string}> = [
  {scheme: 'ark', prefix: 'n2t.net/ark:'},
  {scheme: 'ark', prefix: 'arks.org/ark:'},
  {scheme: 'handle', prefix: 'hdl.handle.net/'},
  {scheme: 'handle', prefix: 'handle.net/'},
];

/**
 * Disallow list of known non-durable subject namespaces: a vendor’s default
 * hosted URL structure that resolves today but does not survive a contract or
 * CMS change. Mirrors the {@link PID_PREFIXES} allowlist as auditable governance
 * data, each entry justified by a `reason`; tolerant of `http`/`https`.
 *
 * Two modes capture how vendor software splits by where it is hosted:
 * - `host` — a SaaS host shared across institutions (Adlib, Spinque, …). Matches
 *   the host component exactly or on a dot-boundary subdomain, so one entry
 *   covers every current and future subdomain while rejecting look-alikes.
 * - `path` — a distinctive software path under the institution’s own domain,
 *   the only thing that flags *self-hosted* software (e.g. Atlantis under
 *   `geheugenvanzoetermeer.nl`). Matched as a slash-bounded substring.
 */
const NON_DURABLE_NAMESPACES: ReadonlyArray<{
  mode: 'host' | 'path';
  value: string;
  reason: string;
}> = [
  {mode: 'host', value: 'adlibhosting.com', reason: 'Axiell Adlib SaaS host'},
  {mode: 'host', value: 'spinque.com', reason: 'Spinque SaaS host'},
  {mode: 'host', value: 'kleksi.com', reason: 'Kleksi SaaS host'},
  {mode: 'host', value: 'xentropics.cloud', reason: 'Xentropics-hosted Omeka'},
  {
    mode: 'path',
    value: '/AtlantisPubliek/',
    reason: 'Deventit Atlantis software',
  },
];

const DEFAULT_SOFTWARE = namedNode(
  'https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph',
);

/** Default number of subject URIs sampled per dataset. */
export const DEFAULT_SAMPLE_SIZE = 10;

/**
 * Default in-flight dereference cap. Kept low because the sampled URIs
 * typically share a single resolver host that we must not overload.
 */
const DEFAULT_CONCURRENCY = 4;

/**
 * Budget for the sample SELECT. The transform runs outside the stage runner, so
 * the Pipeline's adaptive timeout policy is out of reach; a bounded constant
 * keeps one slow endpoint from stalling the run.
 */
const SAMPLE_TIMEOUT_MS = 60_000;

/** Per-request budget for dereferencing a sampled URI and the arks.org lookup. */
const DEREFERENCE_TIMEOUT_MS = 10_000;

/** Samples up to `sampleSize` distinct subject IRIs from `uriSpace`. */
export type SampleUris = (
  uriSpace: string,
  sampleSize: number,
  context: {dataset: Dataset; distribution: Distribution},
) => Promise<string[]>;

/**
 * Resolves a sampled URI and reports whether it lands on a self-describing
 * page: a `200`, `text/html` response whose body advertises the original URI.
 */
export type ResolveUri = (uri: string) => Promise<boolean>;

/** Looks up the issuing organisation’s name for an ARK NAAN, if available. */
export type LookupOrg = (naan: string) => Promise<string | undefined>;

export interface SubjectUriResolutionOptions {
  /**
   * URI prefixes to exclude as terminology sources when picking the dataset’s
   * own subject namespace — typically the keys of `buildUriSpacesMap()`.
   * Matched with `startsWith`.
   */
  terminologyPrefixes: Iterable<string>;
  /** Number of subject URIs to sample and dereference. @default 10 */
  sampleSize?: number;
  /** Maximum concurrent dereferences. @default 4 */
  concurrency?: number;
  /** Subject-URI sampler. Injectable for testing; defaults to a SPARQL query. */
  sampleUris?: SampleUris;
  /** Resolution check. Injectable for testing; defaults to an HTTP fetch. */
  resolve?: ResolveUri;
  /** ARK organisation lookup. Injectable for testing; defaults to arks.org. */
  lookupOrg?: LookupOrg;
  /**
   * IRI identifying the software for the `prov:wasAssociatedWith` link.
   * Defaults to the DKG repository.
   */
  software?: string;
}

/**
 * A {@link QuadTransform} for the `subject-uri-space` VoID stage that turns the
 * dataset’s subject namespaces into a *resolution* measurement, layering
 * persistent-identifier (PID) detection on top.
 *
 * It harvests the `void:uriSpace`/`void:entities` subsets from the stage
 * output (passing them through unchanged), picks the single most common
 * non-terminology namespace — the one the dataset mints for its own resources —
 * samples URIs from it, and dereferences them. The outcome is appended,
 * scoped to that namespace’s subset node:
 *
 * - **declared** facts: `dcterms:conformsTo` a PID scheme (ARK/Handle, only if
 *   recognised) and `dcterms:publisher` the ARK issuing org (non-fatal);
 * - **validated** facts: `subject-uris-sampled` / `subject-uris-resolved` DQV
 *   measurements plus a PROV activity.
 * - **durability** facts: a `subject-namespace-durable = false` DQV measurement
 *   when the chosen namespace matches the {@link NON_DURABLE_NAMESPACES}
 *   disallow list — emitted independently of sampling, so it survives an
 *   endpoint failure.
 *
 * The metric names are namespace-neutral because the ratio applies to any
 * namespace; PID-ness lives only in the scheme label. If no non-terminology
 * namespace survives, nothing is appended.
 *
 * Attach it to {@link VOID_STAGE_NAMES.subjectUriSpace} via `voidStages`.
 */
export function subjectUriResolution(
  options: SubjectUriResolutionOptions,
): QuadTransform<ExecutorContext> {
  const terminologyPrefixes = [...options.terminologyPrefixes];
  const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE_SIZE;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const sampleUris = options.sampleUris ?? defaultSampleUris;
  const resolve = options.resolve ?? defaultResolve;
  const lookupOrg = options.lookupOrg ?? defaultLookupOrg;
  const software = options.software
    ? namedNode(options.software)
    : DEFAULT_SOFTWARE;

  return async function* (quads, {dataset, distribution}) {
    // Harvest the subsets while passing every quad through unchanged.
    const uriSpaceBySubset = new Map<string, string>();
    const entitiesBySubset = new Map<string, number>();
    for await (const q of quads) {
      yield q;
      if (q.predicate.equals(VOID_URI_SPACE)) {
        uriSpaceBySubset.set(q.subject.value, q.object.value);
      } else if (q.predicate.equals(VOID_ENTITIES)) {
        entitiesBySubset.set(q.subject.value, Number(q.object.value));
      }
    }

    const winner = pickWinner(
      uriSpaceBySubset,
      entitiesBySubset,
      terminologyPrefixes,
    );
    // No non-terminology namespace survived: emit nothing extra.
    if (winner === undefined) {
      return;
    }

    // Durability is knowable from the namespace string alone, so flag it before
    // (and outside) the best-effort sampling block: a vendor preview domain
    // whose endpoint is slow today is exactly what we most want flagged.
    if (isNonDurable(winner.uriSpace)) {
      yield* nonDurableMeasurement(namedNode(winner.subset), software);
    }

    // Enrichment is best-effort: a failed sample must not drop the VoID output
    // that already streamed through, so swallow and emit nothing extra.
    let measurements: Quad[];
    try {
      const sampled = await sampleUris(winner.uriSpace, sampleSize, {
        dataset,
        distribution,
      });
      const limit = pLimit(concurrency);
      const outcomes = await Promise.allSettled(
        sampled.map(uri => limit(() => resolve(uri))),
      );
      const resolved = outcomes.filter(
        outcome => outcome.status === 'fulfilled' && outcome.value,
      ).length;

      const scheme = detectPidScheme(winner.uriSpace);
      const org =
        scheme === 'ark'
          ? await lookupArkOrg(winner.uriSpace, lookupOrg)
          : undefined;

      measurements = [
        ...measurementQuads(
          namedNode(winner.subset),
          sampled.length,
          resolved,
          scheme,
          org,
          software,
        ),
      ];
    } catch {
      return;
    }

    yield* measurements;
  };
}

/** Pick the subset with the most entities whose namespace is not a terminology source. */
function pickWinner(
  uriSpaceBySubset: ReadonlyMap<string, string>,
  entitiesBySubset: ReadonlyMap<string, number>,
  terminologyPrefixes: readonly string[],
): {subset: string; uriSpace: string} | undefined {
  let best: {subset: string; uriSpace: string; entities: number} | undefined;
  for (const [subset, uriSpace] of uriSpaceBySubset) {
    if (terminologyPrefixes.some(prefix => uriSpace.startsWith(prefix))) {
      continue;
    }
    const entities = entitiesBySubset.get(subset) ?? 0;
    if (best === undefined || entities > best.entities) {
      best = {subset, uriSpace, entities};
    }
  }
  return best && {subset: best.subset, uriSpace: best.uriSpace};
}

/** Strip a leading `http://`/`https://` once, so host/path matching is scheme-neutral. */
function stripScheme(uriSpace: string): string {
  return uriSpace.replace(/^https?:\/\//, '');
}

/** Classify a namespace as an ARK/Handle PID scheme, tolerant of http/https. */
function detectPidScheme(uriSpace: string): PidScheme | undefined {
  const withoutScheme = stripScheme(uriSpace);
  return PID_PREFIXES.find(({prefix}) => withoutScheme.startsWith(prefix))
    ?.scheme;
}

/**
 * Whether a namespace is on the {@link NON_DURABLE_NAMESPACES} disallow list.
 * `host` entries match the host component exactly or on a dot-boundary
 * subdomain; `path` entries match anywhere as a slash-bounded substring.
 */
function isNonDurable(uriSpace: string): boolean {
  const withoutScheme = stripScheme(uriSpace);
  const host = withoutScheme.split('/')[0];
  return NON_DURABLE_NAMESPACES.some(({mode, value}) =>
    mode === 'host'
      ? host === value || host.endsWith(`.${value}`)
      : withoutScheme.includes(value),
  );
}

/** Extract the NAAN from an ARK namespace, e.g. `…/ark:/60537/` → `60537`. */
function arkNaan(uriSpace: string): string | undefined {
  return uriSpace.match(/ark:\/?([^/]+)/)?.[1];
}

async function lookupArkOrg(
  uriSpace: string,
  lookupOrg: LookupOrg,
): Promise<string | undefined> {
  const naan = arkNaan(uriSpace);
  if (naan === undefined) return undefined;
  try {
    return await lookupOrg(naan);
  } catch {
    // Non-fatal: emit the scheme without an org.
    return undefined;
  }
}

function* measurementQuads(
  subset: ReturnType<typeof namedNode>,
  sampled: number,
  resolved: number,
  scheme: PidScheme | undefined,
  org: string | undefined,
  software: ReturnType<typeof namedNode>,
): Generator<Quad> {
  // Declared facts — only for a recognised PID scheme.
  if (scheme !== undefined) {
    yield quad(subset, DCTERMS_CONFORMS_TO, PID_SCHEMES[scheme]);
  }
  if (org !== undefined) {
    yield quad(subset, DCTERMS_PUBLISHER, literal(org));
  }

  // PROV: the sampling/dereferencing activity.
  const activity = blankNode();
  yield* activityQuads(activity, subset, software);

  // Validated facts — the sampled/resolved ratio, for any namespace.
  const sampledMeasurement = blankNode();
  const resolvedMeasurement = blankNode();
  yield quad(subset, DQV_HAS_QUALITY_MEASUREMENT, sampledMeasurement);
  yield quad(subset, DQV_HAS_QUALITY_MEASUREMENT, resolvedMeasurement);

  yield* integerMeasurement(
    sampledMeasurement,
    subset,
    SUBJECT_URIS_SAMPLED_METRIC,
    sampled,
    activity,
  );
  yield* integerMeasurement(
    resolvedMeasurement,
    subset,
    SUBJECT_URIS_RESOLVED_METRIC,
    resolved,
    activity,
  );
}

/**
 * The non-durability marker: `subject-namespace-durable = false`, emitted only
 * on a disallow-list hit (absence stays weaker than a durability claim). Carries
 * its own PROV activity so it survives a sampling/endpoint failure.
 */
function* nonDurableMeasurement(
  subset: ReturnType<typeof namedNode>,
  software: ReturnType<typeof namedNode>,
): Generator<Quad> {
  const activity = blankNode();
  yield* activityQuads(activity, subset, software);

  const measurement = blankNode();
  yield quad(subset, DQV_HAS_QUALITY_MEASUREMENT, measurement);
  yield* booleanMeasurement(
    measurement,
    subset,
    SUBJECT_NAMESPACE_DURABLE_METRIC,
    false,
    activity,
  );
}

function* activityQuads(
  activity: ReturnType<typeof blankNode>,
  used: ReturnType<typeof namedNode>,
  software: ReturnType<typeof namedNode>,
): Generator<Quad> {
  yield quad(activity, RDF_TYPE, PROV_ACTIVITY);
  yield quad(activity, PROV_USED, used);
  yield quad(activity, PROV_WAS_ASSOCIATED_WITH, software);
}

function* integerMeasurement(
  measurement: ReturnType<typeof blankNode>,
  computedOn: ReturnType<typeof namedNode>,
  metric: ReturnType<typeof namedNode>,
  value: number,
  activity: ReturnType<typeof blankNode>,
): Generator<Quad> {
  yield quad(measurement, RDF_TYPE, DQV_QUALITY_MEASUREMENT);
  yield quad(measurement, DQV_COMPUTED_ON, computedOn);
  yield quad(measurement, DQV_IS_MEASUREMENT_OF, metric);
  yield quad(measurement, DQV_VALUE, literal(String(value), XSD_INTEGER));
  yield quad(measurement, PROV_WAS_GENERATED_BY, activity);
}

function* booleanMeasurement(
  measurement: ReturnType<typeof blankNode>,
  computedOn: ReturnType<typeof namedNode>,
  metric: ReturnType<typeof namedNode>,
  value: boolean,
  activity: ReturnType<typeof blankNode>,
): Generator<Quad> {
  yield quad(measurement, RDF_TYPE, DQV_QUALITY_MEASUREMENT);
  yield quad(measurement, DQV_COMPUTED_ON, computedOn);
  yield quad(measurement, DQV_IS_MEASUREMENT_OF, metric);
  yield quad(measurement, DQV_VALUE, literal(String(value), XSD_BOOLEAN));
  yield quad(measurement, PROV_WAS_GENERATED_BY, activity);
}

/**
 * Default sampler: a `SELECT DISTINCT ?s … LIMIT n` short-circuited on the
 * namespace prefix, run as a plain SPARQL SELECT against the distribution's
 * endpoint. The fetcher's own timeout fast-fails a slow endpoint, since the
 * transform runs outside the stage runner where the Pipeline's adaptive policy
 * would normally apply. The distribution's subject filter and named graph are
 * woven into the query, mirroring the VoID class selector.
 */
const defaultSampleUris: SampleUris = async (
  uriSpace,
  sampleSize,
  {distribution},
) => {
  const subjectFilter = distribution.subjectFilter ?? '';
  let fromClause = '';
  if (distribution.namedGraph) {
    assertSafeIri(distribution.namedGraph);
    fromClause = `FROM <${distribution.namedGraph}>`;
  }
  const query = [
    'SELECT DISTINCT ?s',
    fromClause,
    'WHERE {',
    `  ${subjectFilter}`,
    '  ?s ?p ?o .',
    `  FILTER(ISIRI(?s) && STRSTARTS(STR(?s), ${sparqlString(uriSpace)}))`,
    '}',
    `LIMIT ${sampleSize}`,
  ].join('\n');

  const fetcher = new SparqlEndpointFetcher({timeout: SAMPLE_TIMEOUT_MS});
  // fetchBindings yields IBindings (object mode), not the string/Buffer the
  // NodeJS.ReadableStream type implies.
  const bindings = (await fetcher.fetchBindings(
    distribution.accessUrl.toString(),
    query,
  )) as unknown as AsyncIterable<IBindings>;
  const subjects: string[] = [];
  for await (const row of bindings) {
    if (row.s?.termType === 'NamedNode') subjects.push(row.s.value);
  }
  return subjects;
};

/**
 * Default resolution check: follow redirects to the landing page and require a
 * `200`, `text/html` response that advertises the original sampled URI (raw or
 * HTML-entity-escaped) — the permanent link back to the user, which matters
 * because we landed on a different, redirected URL.
 */
const defaultResolve: ResolveUri = async uri => {
  let response: Response;
  try {
    response = await fetch(uri, {
      redirect: 'follow',
      headers: {accept: 'text/html'},
      signal: AbortSignal.timeout(DEREFERENCE_TIMEOUT_MS),
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) {
    return false;
  }
  let body: string;
  try {
    body = await response.text();
  } catch {
    return false;
  }
  return body.includes(uri) || body.includes(htmlEscape(uri));
};

/**
 * Default ARK org lookup: read `properties.who.name` from the arks.org NAAN
 * record (e.g. `ark:60537` → `Gouda Tijdmachine`).
 */
const defaultLookupOrg: LookupOrg = async naan => {
  let response: Response;
  try {
    response = await fetch(`https://arks.org/ark:${encodeURIComponent(naan)}`, {
      redirect: 'follow',
      headers: {accept: 'application/json'},
      signal: AbortSignal.timeout(DEREFERENCE_TIMEOUT_MS),
    });
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return undefined;
  }
  const name = (data as {properties?: {who?: {name?: unknown}}} | null)
    ?.properties?.who?.name;
  return typeof name === 'string' ? name : undefined;
};

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sparqlString(value: string): string {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t');
  return `"${escaped}"`;
}
