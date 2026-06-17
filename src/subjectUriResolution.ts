import {DataFactory} from 'n3';
import pLimit from 'p-limit';
import {SparqlEndpointFetcher, type IBindings} from 'fetch-sparql-endpoint';
import type {NamedNode, Quad} from '@rdfjs/types';
import {_void, dcterms, dqv, prov, rdf, xsd} from '@tpluscode/rdf-ns-builders';
import {
  assertSafeIri,
  skolemIri,
  type Dataset,
  type Distribution,
} from '@lde/dataset';
import type {ExecutorContext, QuadTransform} from '@lde/pipeline';
import {
  failureReasonIri,
  failureUsageQuads,
  type SampleFailure,
} from './failureUsage.js';
import {metric} from './namespaces.js';
import {iiifManifestFormatFilter} from './iiifManifestDetection.js';

const {namedNode, literal, quad} = DataFactory;

const SUBJECT_RESOLUTION_FAILURE_BASE =
  'https://def.nde.nl/subject-resolution-failure#';

/**
 * Why a sampled subject URI did not resolve to a self-describing landing page.
 * Mirrors the `subject-resolution-failure` concept scheme; a `null` outcome
 * (resolved) is represented out-of-band.
 *
 * Outcomes split into two classes (see {@link isTransientFailure}):
 * - **definitive** — `http-error` (a non-retryable `4xx` such as `404`/`410`),
 *   `wrong-content-type`, `no-self-reference`: a genuine, dataset-attributable
 *   defect. Counted against the ratio and persisted in the PROV trail.
 * - **transient** — `timeout`, `network-error`, `server-error` (a retryable HTTP
 *   status: `408`/`425`/`429`/`5xx`): a blip in the multi-hop PID-resolver
 *   chain, not a property of the dataset.
 *   Retried with backoff; if still failing it is excluded from the sample
 *   entirely (neither counted nor persisted).
 */
export type SubjectResolutionFailure =
  | 'timeout'
  | 'network-error'
  | 'server-error'
  | 'http-error'
  | 'wrong-content-type'
  | 'no-self-reference';

/**
 * Transient failures: a slow or briefly unavailable hop in the resolver chain,
 * not a broken PID. Retried, then excluded from the denominator rather than
 * scored as a non-resolution — so a single network blip during a crawl cannot
 * report a healthy dataset as partially broken.
 */
const TRANSIENT_FAILURES: ReadonlySet<SubjectResolutionFailure> = new Set([
  'timeout',
  'network-error',
  'server-error',
]);

function isTransientFailure(reason: SubjectResolutionFailure): boolean {
  return TRANSIENT_FAILURES.has(reason);
}

/** Map a failure reason to its `subject-resolution-failure#` concept IRI. */
function subjectResolutionFailureIri(reason: SubjectResolutionFailure) {
  return failureReasonIri(SUBJECT_RESOLUTION_FAILURE_BASE, reason);
}

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
 * data, each entry tagged with the `reason` it is non-durable; tolerant of
 * `http`/`https`.
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
  {mode: 'host', value: 'adlibhosting.com', reason: 'vendor'},
  {mode: 'host', value: 'spinque.com', reason: 'vendor'},
  {mode: 'host', value: 'kleksi.com', reason: 'vendor'},
  {mode: 'host', value: 'xentropics.cloud', reason: 'vendor'},
  {mode: 'path', value: '/AtlantisPubliek/', reason: 'vendor'},
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

/**
 * Per-request budget for dereferencing a sampled URI and the arks.org lookup.
 * Kept generous because ARK/Handle resolution traverses a multi-hop global
 * chain (`n2t.net → arks.org → institutional host → landing page`); a single
 * slow or briefly rate-limited hop must not trip a false non-resolution.
 */
const DEREFERENCE_TIMEOUT_MS = 15_000;

/**
 * Extra attempts for a transient dereference failure before giving up. Combined
 * with {@link retryDelay}, the effective budget for a flaky resolver chain
 * spans several timeouts, not one.
 */
const DEFAULT_RETRIES = 2;

/**
 * Overall wall-clock budget for dereferencing the whole sample, independent of
 * the per-request {@link DEREFERENCE_TIMEOUT_MS}. Caps a flaky namespace’s retry
 * storm: once it elapses, in-flight fetches abort and no further retries are
 * scheduled, so the transform — which runs outside the Pipeline’s adaptive
 * timeout — cannot stall the run for minutes.
 */
const DEREFERENCE_PHASE_BUDGET_MS = 60_000;

/** Exponential backoff before retry attempt `attempt` (0-based): 500 ms, 1 s, … */
function retryDelay(attempt: number): number {
  return 500 * 2 ** attempt;
}

/** Injectable sleep so tests drive the retry loop without real delays. */
export type Sleep = (milliseconds: number) => Promise<void>;

const defaultSleep: Sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

/** Samples up to `sampleSize` distinct subject IRIs from `uriSpace`. */
export type SampleUris = (
  uriSpace: string,
  sampleSize: number,
  context: {dataset: Dataset; distribution: Distribution},
) => Promise<string[]>;

/**
 * Resolves a sampled URI and classifies the outcome: `null` when it lands on a
 * self-describing page (a `200`, `text/html` response whose body advertises the
 * original URI), otherwise the {@link SubjectResolutionFailure} describing why
 * it did not. The optional `signal` carries the overall
 * {@link DEREFERENCE_PHASE_BUDGET_MS phase budget}; honour it on the underlying
 * request so a flaky chain aborts rather than running its full per-request
 * timeout once the budget is spent.
 */
export type ResolveUri = (
  uri: string,
  signal?: AbortSignal,
) => Promise<SubjectResolutionFailure | null>;

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
  /** Extra attempts for a transient failure before giving up. @default 2 */
  retries?: number;
  /** Backoff between retries. Injectable for testing; defaults to real delays. */
  sleep?: Sleep;
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
  const retries = options.retries ?? DEFAULT_RETRIES;
  const sleep = options.sleep ?? defaultSleep;
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
      if (q.predicate.equals(_void.uriSpace)) {
        uriSpaceBySubset.set(q.subject.value, q.object.value);
      } else if (q.predicate.equals(_void.entities)) {
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
      // One budget shared across every dereference: once it elapses, in-flight
      // fetches abort and resolveWithRetry stops scheduling retries.
      const phaseSignal = AbortSignal.timeout(DEREFERENCE_PHASE_BUDGET_MS);
      const outcomes = await Promise.all(
        sampled.map(uri =>
          limit(() =>
            resolveWithRetry(uri, resolve, retries, sleep, phaseSignal),
          ),
        ),
      );

      // Classify each settled outcome. A `null` resolves; a *definitive* reason
      // is a real defect — counted and persisted. A *transient* reason survived
      // every retry, so the resolver chain (not the dataset) is at fault: drop
      // the URI from the sample entirely rather than scoring it as broken.
      let resolved = 0;
      const failures: SampleFailure[] = [];
      sampled.forEach((uri, index) => {
        const reason = outcomes[index];
        if (reason === null) {
          resolved++;
        } else if (!isTransientFailure(reason)) {
          failures.push({
            url: uri,
            reasonIri: subjectResolutionFailureIri(reason),
          });
        }
      });
      // The denominator counts only definitively-judged URIs; transient ones are
      // excluded from both branches above.
      const measurable = resolved + failures.length;

      const subset = namedNode(winner.subset);
      const scheme = detectPidScheme(winner.uriSpace);
      const org =
        scheme === 'ark'
          ? await lookupArkOrg(winner.uriSpace, lookupOrg)
          : undefined;

      // Declared facts (PID scheme, issuing org) are knowable from the namespace
      // alone, so they are emitted even when nothing was measurable this run —
      // either an empty sample or every URI transiently unreachable. The
      // sampled/resolved ratio is appended only when there is something to
      // report, so the diagnostic queries never see a misleading 0/0.
      const declared = [...declaredFactQuads(subset, scheme, org)];
      measurements =
        measurable === 0
          ? declared
          : [
              ...declared,
              ...measurementQuads(
                subset,
                measurable,
                resolved,
                failures,
                software,
              ),
            ];
    } catch {
      return;
    }

    yield* measurements;
  };
}

/**
 * Resolve a URI, retrying a {@link isTransientFailure transient} outcome with
 * exponential backoff up to `retries` times. Returns the final outcome: `null`
 * (resolved), a definitive failure, or — once retries are exhausted — the last
 * transient failure. An unexpected rejection from `resolve` is treated as a
 * transient `network-error`, so a flaky check is retried rather than surfacing a
 * stray non-resolution. Stops early once `signal` (the overall phase budget)
 * aborts, so a flaky chain cannot keep retrying past the run’s budget.
 */
async function resolveWithRetry(
  uri: string,
  resolve: ResolveUri,
  retries: number,
  sleep: Sleep,
  signal: AbortSignal,
): Promise<SubjectResolutionFailure | null> {
  let outcome: SubjectResolutionFailure | null;
  for (let attempt = 0; ; attempt++) {
    try {
      outcome = await resolve(uri, signal);
    } catch {
      outcome = 'network-error';
    }
    if (
      outcome === null ||
      !isTransientFailure(outcome) ||
      attempt >= retries ||
      signal.aborted
    ) {
      return outcome;
    }
    await sleep(retryDelay(attempt));
  }
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

/**
 * Declared facts about the namespace, knowable from the namespace string alone
 * and independent of whether the sample resolved: `dcterms:conformsTo` a PID
 * scheme (only when recognised) and the ARK issuing org as `dcterms:publisher`.
 * Emitted even when nothing was measurable, so they survive an empty sample or a
 * fully-unreachable resolver chain.
 */
function* declaredFactQuads(
  subset: NamedNode,
  scheme: PidScheme | undefined,
  org: string | undefined,
): Generator<Quad> {
  if (scheme !== undefined) {
    yield quad(subset, dcterms.conformsTo, PID_SCHEMES[scheme]);
  }
  if (org !== undefined) {
    yield quad(subset, dcterms.publisher, literal(org));
  }
}

function* measurementQuads(
  subset: NamedNode,
  sampled: number,
  resolved: number,
  failures: readonly SampleFailure[],
  software: NamedNode,
): Generator<Quad> {
  // PROV: the sampling/dereferencing activity, with a qualified usage per
  // failed sample naming the URI and why it did not resolve. Every structural
  // node is a skolem IRI derived from the (unique) subset, not a blank node, so
  // it cannot collide with another stage’s nodes in the dataset graph (#352).
  const activity = namedNode(skolemIri(subset.value, 'resolution-activity'));
  yield* activityQuads(activity, subset, software);
  yield* failureUsageQuads(activity, failures);

  // Validated facts — the sampled/resolved ratio, for any namespace.
  const sampledMeasurement = namedNode(
    skolemIri(subset.value, 'measurement', 'subject-uris-sampled'),
  );
  const resolvedMeasurement = namedNode(
    skolemIri(subset.value, 'measurement', 'subject-uris-resolved'),
  );
  yield quad(subset, dqv.hasQualityMeasurement, sampledMeasurement);
  yield quad(subset, dqv.hasQualityMeasurement, resolvedMeasurement);

  yield* integerMeasurement(
    sampledMeasurement,
    subset,
    metric['subject-uris-sampled'],
    sampled,
    activity,
  );
  yield* integerMeasurement(
    resolvedMeasurement,
    subset,
    metric['subject-uris-resolved'],
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
  subset: NamedNode,
  software: NamedNode,
): Generator<Quad> {
  const activity = namedNode(skolemIri(subset.value, 'durability-activity'));
  yield* activityQuads(activity, subset, software);

  const measurement = namedNode(
    skolemIri(subset.value, 'measurement', 'subject-namespace-durable'),
  );
  yield quad(subset, dqv.hasQualityMeasurement, measurement);
  yield* booleanMeasurement(
    measurement,
    subset,
    metric['subject-namespace-durable'],
    false,
    activity,
  );
}

function* activityQuads(
  activity: NamedNode,
  used: NamedNode,
  software: NamedNode,
): Generator<Quad> {
  yield quad(activity, rdf.type, prov.Activity);
  yield quad(activity, prov.used, used);
  yield quad(activity, prov.wasAssociatedWith, software);
}

function* integerMeasurement(
  measurement: NamedNode,
  computedOn: NamedNode,
  metricNode: NamedNode,
  value: number,
  activity: NamedNode,
): Generator<Quad> {
  yield quad(measurement, rdf.type, dqv.QualityMeasurement);
  yield quad(measurement, dqv.computedOn, computedOn);
  yield quad(measurement, dqv.isMeasurementOf, metricNode);
  yield quad(measurement, dqv.value, literal(String(value), xsd.integer));
  yield quad(measurement, prov.wasGeneratedBy, activity);
}

function* booleanMeasurement(
  measurement: NamedNode,
  computedOn: NamedNode,
  metricNode: NamedNode,
  value: boolean,
  activity: NamedNode,
): Generator<Quad> {
  yield quad(measurement, rdf.type, dqv.QualityMeasurement);
  yield quad(measurement, dqv.computedOn, computedOn);
  yield quad(measurement, dqv.isMeasurementOf, metricNode);
  yield quad(measurement, dqv.value, literal(String(value), xsd.boolean));
  yield quad(measurement, prov.wasGeneratedBy, activity);
}

/**
 * SPARQL `FILTER NOT EXISTS` fragment that drops any sampled subject the IIIF
 * criterion already assesses as a manifest: either the subject is itself a
 * manifest node (it bears an IIIF `schema:encodingFormat`) or it is the
 * `schema:contentUrl` such a node dereferences to. Without it, an ARK+IIIF
 * publisher’s manifest URLs (e.g. `…/ark:/85849/{uuid}/iiif.json`) can be
 * sampled here and fail as `wrong-content-type` — a manifest correctly serves
 * JSON, not `text/html` — while simultaneously passing the IIIF criterion: one
 * URL both green (IIIF) and red (persistent identifier). Excluding them leaves
 * manifests to the IIIF criterion alone and resolves the contradiction.
 *
 * The manifest test is the shared {@link iiifManifestFormatFilter} — the same
 * encodingFormat rule the IIIF criterion uses — so the two cannot drift. The
 * dereference target mirrors `queries/analysis/iiif.rq`: `schema:contentUrl`
 * when present, else the encodingFormat-bearing node. Tolerant of `http`/`https`
 * schema.org like that query.
 *
 * The `http`/`https` predicates are enumerated with `VALUES` rather than a
 * property-path alternation (`a|b`): the latter is mis-evaluated by the query
 * engine inside `FILTER NOT EXISTS` — when no triple uses the predicate at all,
 * the whole `NOT EXISTS` collapses to false and drops every subject.
 */
const IIIF_MANIFEST_EXCLUSION = `FILTER NOT EXISTS {
    VALUES ?encodingFormatPredicate {
      <https://schema.org/encodingFormat> <http://schema.org/encodingFormat>
    }
    # ?s is itself the manifest node …
    { ?s ?encodingFormatPredicate ?iiifFormat . }
    UNION
    # … or ?s is the schema:contentUrl the manifest node dereferences to.
    {
      VALUES ?contentUrlPredicate {
        <https://schema.org/contentUrl> <http://schema.org/contentUrl>
      }
      ?manifestNode ?contentUrlPredicate ?s ;
        ?encodingFormatPredicate ?iiifFormat .
    }
    FILTER(${iiifManifestFormatFilter('iiifFormat')})
  }`;

/**
 * Build the subject-URI sample query: a `SELECT DISTINCT ?s … LIMIT n`
 * short-circuited on the namespace prefix, with the distribution's subject
 * filter and named graph woven in (mirroring the VoID class selector), the
 * {@link IIIF_MANIFEST_EXCLUSION known IIIF manifests} filtered out, and the
 * URI space prefix itself excluded (it matches its own `STRSTARTS` but is the
 * namespace, not a dereferenceable resource). Exported so the exclusions can be
 * exercised against an in-memory store.
 */
export function buildSampleQuery(
  uriSpace: string,
  sampleSize: number,
  subjectFilter: string,
  namedGraph?: string,
): string {
  let fromClause = '';
  if (namedGraph) {
    assertSafeIri(namedGraph);
    fromClause = `FROM <${namedGraph}>`;
  }
  return [
    'SELECT DISTINCT ?s',
    fromClause,
    'WHERE {',
    `  ${subjectFilter}`,
    '  ?s ?p ?o .',
    `  FILTER(ISIRI(?s) && STRSTARTS(STR(?s), ${sparqlString(uriSpace)}) && STR(?s) != ${sparqlString(uriSpace)})`,
    `  ${IIIF_MANIFEST_EXCLUSION}`,
    '}',
    `LIMIT ${sampleSize}`,
  ].join('\n');
}

/**
 * Default sampler: runs {@link buildSampleQuery} as a plain SPARQL SELECT
 * against the distribution's endpoint. The fetcher's own timeout fast-fails a
 * slow endpoint, since the transform runs outside the stage runner where the
 * Pipeline's adaptive policy would normally apply.
 */
const defaultSampleUris: SampleUris = async (
  uriSpace,
  sampleSize,
  {distribution},
) => {
  const query = buildSampleQuery(
    uriSpace,
    sampleSize,
    distribution.subjectFilter ?? '',
    distribution.namedGraph,
  );

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
 * because we landed on a different, redirected URL. Returns `null` on success,
 * otherwise the {@link SubjectResolutionFailure} classifying the breakage.
 */
const defaultResolve: ResolveUri = async (uri, signal) => {
  // The request aborts on whichever fires first: its own per-request timeout or
  // the overall phase budget carried by `signal`.
  const timeout = AbortSignal.timeout(DEREFERENCE_TIMEOUT_MS);
  const abort = signal ? AbortSignal.any([timeout, signal]) : timeout;
  let response: Response;
  try {
    response = await fetch(uri, {
      redirect: 'follow',
      headers: {accept: 'text/html'},
      signal: abort,
    });
  } catch (error) {
    return classifyFetchError(error);
  }
  if (!response.ok) return classifyHttpStatus(response.status);
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) {
    return 'wrong-content-type';
  }
  let body: string;
  try {
    body = await response.text();
  } catch {
    // A `200 text/html` whose body cannot be read is a transport failure.
    return 'network-error';
  }
  return body.includes(uri) || body.includes(htmlEscape(uri))
    ? null
    : 'no-self-reference';
};

/**
 * Split an abort/timeout from a generic transport failure by the caught error’s
 * name: `AbortSignal.timeout` rejects with a `TimeoutError`, an external abort
 * with an `AbortError`; anything else is a `network-error`.
 */
function classifyFetchError(error: unknown): SubjectResolutionFailure {
  const name = (error as {name?: unknown} | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError'
    ? 'timeout'
    : 'network-error';
}

/**
 * Status codes that signal a temporary condition the resolver chain may recover
 * from: `408` Request Timeout, `425` Too Early, `429` Too Many Requests, and any
 * `5xx`. Everything else non-2xx (a `4xx` such as `404`/`410`) is definitive.
 */
const TRANSIENT_HTTP_STATUSES: ReadonlySet<number> = new Set([408, 425, 429]);

/**
 * Split a non-2xx status into a transient `server-error` (the server says “try
 * later”; see {@link TRANSIENT_HTTP_STATUSES}) and a definitive `http-error`
 * (the resource is genuinely gone).
 */
function classifyHttpStatus(status: number): SubjectResolutionFailure {
  return TRANSIENT_HTTP_STATUSES.has(status) || status >= 500
    ? 'server-error'
    : 'http-error';
}

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
