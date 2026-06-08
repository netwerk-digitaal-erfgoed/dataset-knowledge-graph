import {DataFactory} from 'n3';
import pLimit from 'p-limit';
import type {Quad} from '@rdfjs/types';
import type {Dataset, Distribution} from '@lde/dataset';
import {
  SparqlConstructExecutor,
  NotSupported,
  type ExecutorContext,
  type QuadTransform,
} from '@lde/pipeline';

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

const METRIC_BASE = 'https://def.nde.nl/metric#';
const SUBJECT_URIS_SAMPLED_METRIC = namedNode(
  `${METRIC_BASE}subject-uris-sampled`,
);
const SUBJECT_URIS_RESOLVED_METRIC = namedNode(
  `${METRIC_BASE}subject-uris-resolved`,
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
  {scheme: 'handle', prefix: 'hdl.handle.net'},
  {scheme: 'handle', prefix: 'handle.net'},
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

/** Marker predicate/object for the internal sampling CONSTRUCT. */
const SAMPLE_MARKER = namedNode('https://def.nde.nl/internal#sampled-subject');

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

/** Classify a namespace as an ARK/Handle PID scheme, tolerant of http/https. */
function detectPidScheme(uriSpace: string): PidScheme | undefined {
  const withoutScheme = uriSpace.replace(/^https?:\/\//, '');
  return PID_PREFIXES.find(({prefix}) => withoutScheme.startsWith(prefix))
    ?.scheme;
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
  yield quad(activity, RDF_TYPE, PROV_ACTIVITY);
  yield quad(activity, PROV_USED, subset);
  yield quad(activity, PROV_WAS_ASSOCIATED_WITH, software);

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

/**
 * Default sampler: a `SELECT DISTINCT ?s … LIMIT n` short-circuited on the
 * namespace prefix, run through {@link SparqlConstructExecutor} so it reuses the
 * distribution’s endpoint, subject filter, and named-graph handling.
 */
const defaultSampleUris: SampleUris = async (
  uriSpace,
  sampleSize,
  {dataset, distribution},
) => {
  const query = [
    `CONSTRUCT { ?s <${SAMPLE_MARKER.value}> <${SAMPLE_MARKER.value}> }`,
    'WHERE {',
    '  {',
    '    SELECT DISTINCT ?s WHERE {',
    '      #subjectFilter#',
    '      ?s ?p ?o .',
    `      FILTER(ISIRI(?s) && STRSTARTS(STR(?s), ${sparqlString(uriSpace)}))`,
    '    }',
    `    LIMIT ${sampleSize}`,
    '  }',
    '}',
  ].join('\n');

  const result = await new SparqlConstructExecutor({query}).execute(
    dataset,
    distribution,
  );
  if (result instanceof NotSupported) return [];

  const subjects = new Set<string>();
  for await (const q of result) {
    subjects.add(q.subject.value);
  }
  return [...subjects];
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
    response = await fetch(`https://arks.org/ark:${naan}`, {
      redirect: 'follow',
      headers: {accept: 'application/json'},
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
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
