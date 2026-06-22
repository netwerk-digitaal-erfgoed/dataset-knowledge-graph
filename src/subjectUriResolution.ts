import {Readable} from 'node:stream';
import {DataFactory} from 'n3';
import {rdfParser} from 'rdf-parse';
import pLimit from 'p-limit';
import {SparqlEndpointFetcher, type IBindings} from 'fetch-sparql-endpoint';
import type {NamedNode, Quad} from '@rdfjs/types';
import {_void, dcterms, dqv} from '@tpluscode/rdf-ns-builders';
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
import {
  booleanMeasurement,
  integerMeasurement,
  provActivity,
} from './measurements.js';
import {iiifManifestFormatFilter} from './iiifManifestDetection.js';

const {namedNode, literal, quad} = DataFactory;

const SUBJECT_RESOLUTION_FAILURE_BASE =
  'https://def.nde.nl/subject-resolution-failure#';

/**
 * Why a sampled subject URI did not resolve. A subject URI resolves when it
 * dereferences to a `2xx` response that is either an HTML page or RDF (any
 * serialisation); {@link Resolution} carries that success out-of-band, so this
 * enum names only the failures. Whether a resolved HTML page is a *landing page*
 * (it self-references its own URI) is a separate, non-failing distinction — see
 * {@link Resolution}. Mirrors the `subject-resolution-failure` concept scheme.
 *
 * Outcomes split into two classes (see {@link isTransientFailure}):
 * - **definitive** — `http-error` (a non-retryable `4xx` such as `404`/`410`)
 *   and `wrong-content-type` (a `2xx` that is neither HTML nor RDF, e.g. a JSON
 *   or plain-text error page): a genuine, dataset-attributable defect. Counted
 *   against the ratio and persisted in the PROV trail.
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
  | 'wrong-content-type';

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
 * The outcome of dereferencing a sampled URI:
 * - `resolved` — a `2xx` response that is HTML or RDF. `landingPage` is `true`
 *   only when it is an HTML page that self-references its own URI (a
 *   human-readable landing page for the identifier); `false` for RDF, or for
 *   HTML that does not mention the URI. A resolved URI counts toward
 *   `subject-uris-resolved` regardless of `landingPage`; the flag only feeds the
 *   (non-failing) `subject-uris-html-landing-pages` count that promotes HTML
 *   landing pages.
 * - `failed` — see {@link SubjectResolutionFailure}.
 */
export type Resolution =
  | {readonly kind: 'resolved'; readonly landingPage: boolean}
  | {readonly kind: 'failed'; readonly reason: SubjectResolutionFailure};

/**
 * Dereferences a sampled URI and classifies the outcome (see {@link Resolution}).
 * The optional `signal` carries the overall
 * {@link DEREFERENCE_PHASE_BUDGET_MS phase budget}; honour it on the underlying
 * request so a flaky chain aborts rather than running its full per-request
 * timeout once the budget is spent.
 */
export type ResolveUri = (
  uri: string,
  signal?: AbortSignal,
) => Promise<Resolution>;

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
 * - **validated** facts: `subject-uris-sampled` / `subject-uris-resolved` /
 *   `subject-uris-html-landing-pages` DQV measurements plus a PROV activity.
 *   A URI resolves when it dereferences to HTML or RDF; the landing-page count
 *   tracks how many resolved to an HTML page that self-references its own URI.
 * - **durability** facts: a `subject-namespace-durable = false` DQV measurement
 *   when the chosen namespace matches the {@link NON_DURABLE_NAMESPACES}
 *   disallow list — emitted independently of sampling, so it survives an
 *   endpoint failure.
 * - **sampling-failure** facts: a `subject-uris-sampling-failed = true` DQV
 *   measurement when the sample query throws on every attempt, so a transient
 *   endpoint blip is distinguishable from a namespace that was never sampled
 *   (the declared facts above survive such a failure too; only the ratio drops).
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

    const subset = namedNode(winner.subset);

    // Durability is knowable from the namespace string alone, so flag it before
    // (and outside) the best-effort sampling block: a vendor preview domain
    // whose endpoint is slow today is exactly what we most want flagged.
    if (isNonDurable(winner.uriSpace)) {
      yield* nonDurableMeasurement(subset, software);
    }

    // Declared facts (PID scheme, issuing org) are knowable from the namespace
    // string alone, independent of whether the sample resolves — so emit them
    // before (and outside) the sampling block, so a sample failure cannot erase
    // them. The ARK org lookup swallows its own errors, so awaiting it here is
    // safe.
    const scheme = detectPidScheme(winner.uriSpace);
    const org =
      scheme === 'ark'
        ? await lookupArkOrg(winner.uriSpace, lookupOrg)
        : undefined;
    yield* declaredFactQuads(subset, scheme, org);

    // Sampling and dereferencing are best-effort: a failure must not drop the
    // VoID output that already streamed through. But discarding them *silently*
    // makes a transient endpoint blip indistinguishable from a namespace that
    // was never sampled, so retry the sample query first and, if it still fails
    // every attempt, record an explicit marker the register can read.
    try {
      const sampled = await sampleUrisWithRetry(
        () => sampleUris(winner.uriSpace, sampleSize, {dataset, distribution}),
        retries,
        sleep,
      );
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

      // Classify each settled outcome. A resolution counts toward the ratio,
      // and toward the HTML-landing-page tally when it is one. A *definitive*
      // failure is a real defect — counted and persisted. A *transient* failure
      // survived every retry, so the resolver chain (not the dataset) is at
      // fault: drop the URI from the sample entirely rather than scoring it as
      // broken.
      let resolved = 0;
      let htmlLandingPages = 0;
      const failures: SampleFailure[] = [];
      sampled.forEach((uri, index) => {
        const outcome = outcomes[index];
        if (outcome.kind === 'resolved') {
          resolved++;
          if (outcome.landingPage) htmlLandingPages++;
        } else if (!isTransientFailure(outcome.reason)) {
          failures.push({
            url: uri,
            reasonIri: subjectResolutionFailureIri(outcome.reason),
          });
        }
      });
      // The denominator counts only definitively-judged URIs; transient ones are
      // excluded. With nothing measurable — an empty sample, or every URI
      // transiently unreachable — the declared facts above stand on their own,
      // so append no misleading 0/0 ratio (and no failure marker: the sample
      // query itself succeeded).
      const measurable = resolved + failures.length;
      if (measurable > 0) {
        yield* measurementQuads(
          subset,
          measurable,
          resolved,
          htmlLandingPages,
          failures,
          software,
        );
      }
    } catch {
      // The sample query threw on every attempt: emit an explicit
      // sampling-failed marker so this is distinguishable from a namespace that
      // was never sampled, instead of vanishing silently.
      yield* samplingFailedMeasurement(subset, software);
    }
  };
}

/**
 * Resolve a URI, retrying a {@link isTransientFailure transient} failure with
 * exponential backoff up to `retries` times. Returns the final outcome: a
 * resolution, a definitive failure, or — once retries are exhausted — the last
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
): Promise<Resolution> {
  let outcome: Resolution;
  for (let attempt = 0; ; attempt++) {
    try {
      outcome = await resolve(uri, signal);
    } catch {
      outcome = {kind: 'failed', reason: 'network-error'};
    }
    if (
      outcome.kind === 'resolved' ||
      !isTransientFailure(outcome.reason) ||
      attempt >= retries ||
      signal.aborted
    ) {
      return outcome;
    }
    await sleep(retryDelay(attempt));
  }
}

/**
 * Run the sample query, retrying a thrown attempt with the same backoff as the
 * per-URI dereference. A thrown sample is an endpoint/network failure — a slow
 * or briefly unavailable endpoint — so a single failed request should not strand
 * the dataset on “never sampled”. After `retries` extra attempts the final error
 * propagates, so the caller can record the failure rather than retry forever.
 */
async function sampleUrisWithRetry(
  sample: () => Promise<string[]>,
  retries: number,
  sleep: Sleep,
): Promise<string[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await sample();
    } catch (error) {
      if (attempt >= retries) throw error;
    }
    await sleep(retryDelay(attempt));
  }
}

/**
 * Pick the subset with the most entities whose namespace is not a terminology
 * source — unless that namespace is itself a recognised ARK/Handle PID scheme.
 *
 * A NAAN registered as a Network of Terms source can also be the publisher’s own
 * persistent-identifier namespace: the Gouda Tijdmachine dataset mints its
 * resources under `https://n2t.net/ark:/60537/`, which the `goudatijdmachine-
 * straten` terminology source declares as a terms prefix too. Excluding it would
 * pick a referenced vendor namespace instead and lose the ARK detection, so
 * PID-ness overrides the terminology exclusion (#373).
 */
function pickWinner(
  uriSpaceBySubset: ReadonlyMap<string, string>,
  entitiesBySubset: ReadonlyMap<string, number>,
  terminologyPrefixes: readonly string[],
): {subset: string; uriSpace: string} | undefined {
  let best: {subset: string; uriSpace: string; entities: number} | undefined;
  for (const [subset, uriSpace] of uriSpaceBySubset) {
    if (
      detectPidScheme(uriSpace) === undefined &&
      terminologyPrefixes.some(prefix => uriSpace.startsWith(prefix))
    ) {
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
 * Emitted even when nothing was measurable, so they survive an empty sample, a
 * fully-unreachable resolver chain, or a sample query that failed entirely.
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
  htmlLandingPages: number,
  failures: readonly SampleFailure[],
  software: NamedNode,
): Generator<Quad> {
  // PROV: the sampling/dereferencing activity, with a qualified usage per
  // failed sample naming the URI and why it did not resolve. Every structural
  // node is a skolem IRI derived from the (unique) subset, not a blank node, so
  // it cannot collide with another stage’s nodes in the dataset graph (#352).
  const activity = namedNode(skolemIri(subset.value, 'resolution-activity'));
  yield* provActivity(activity, subset, software);
  yield* failureUsageQuads(activity, failures);

  // Validated facts — the sampled/resolved ratio, for any namespace, plus how
  // many of the resolved URIs served an HTML landing page (a non-failing signal
  // that promotes human-readable pages without gating the ratio on them).
  const sampledMeasurement = namedNode(
    skolemIri(subset.value, 'measurement', 'subject-uris-sampled'),
  );
  const resolvedMeasurement = namedNode(
    skolemIri(subset.value, 'measurement', 'subject-uris-resolved'),
  );
  const htmlLandingPagesMeasurement = namedNode(
    skolemIri(subset.value, 'measurement', 'subject-uris-html-landing-pages'),
  );
  yield quad(subset, dqv.hasQualityMeasurement, sampledMeasurement);
  yield quad(subset, dqv.hasQualityMeasurement, resolvedMeasurement);
  yield quad(subset, dqv.hasQualityMeasurement, htmlLandingPagesMeasurement);

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
  yield* integerMeasurement(
    htmlLandingPagesMeasurement,
    subset,
    metric['subject-uris-html-landing-pages'],
    htmlLandingPages,
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
  yield* provActivity(activity, subset, software);

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

/**
 * The sampling-failure marker: `subject-uris-sampling-failed = true`, emitted
 * only when the sample query threw on every attempt. It lets a consumer tell an
 * *errored* sample (a transient endpoint failure this run) apart from a
 * namespace that was never sampled — otherwise indistinguishable, both lacking
 * any `subject-uris-sampled` ratio. Carries its own PROV activity, mirroring
 * {@link nonDurableMeasurement}.
 */
function* samplingFailedMeasurement(
  subset: NamedNode,
  software: NamedNode,
): Generator<Quad> {
  const activity = namedNode(
    skolemIri(subset.value, 'sampling-failure-activity'),
  );
  yield* provActivity(activity, subset, software);

  const measurement = namedNode(
    skolemIri(subset.value, 'measurement', 'subject-uris-sampling-failed'),
  );
  yield quad(subset, dqv.hasQualityMeasurement, measurement);
  yield* booleanMeasurement(
    measurement,
    subset,
    metric['subject-uris-sampling-failed'],
    true,
    activity,
  );
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
 * Accept header for dereferencing: HTML is preferred (unweighted, so `q=1`) so a
 * server that *can* serve a human-readable landing page does — which is what the
 * `landingPage` signal promotes — with the common RDF serialisations offered as
 * acceptable fallbacks for a data-only namespace.
 */
const RESOLVE_ACCEPT =
  'text/html,application/ld+json;q=0.9,text/turtle;q=0.9,' +
  'application/rdf+xml;q=0.8,application/n-triples;q=0.8,' +
  'application/trig;q=0.8,application/n-quads;q=0.8';

/**
 * Cap on how many bytes of a response body we read, so a single sampled URI that
 * returns a huge body (a misconfigured multi-GB dump, an unbounded stream) cannot
 * turn a sample check into a memory or CPU sink. Generous: enough to hold any
 * real landing page or to parse a sampled resource's RDF.
 */
export const MAX_BODY_BYTES = 2_000_000;

/** The media type of a response, lower-cased with any parameters stripped. */
function mediaTypeOf(response: Response): string {
  return (response.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

/**
 * Read at most {@link MAX_BODY_BYTES} bytes of the response body as UTF-8 text,
 * then cancel the rest of the stream (releasing the connection). Bounds memory
 * for the self-reference scan and the RDF parse regardless of the body's size or
 * a missing Content-Length. Falls back to `response.text()` when the body is not
 * a readable stream (e.g. a stubbed Response in tests). Rejects on a transport
 * error, which the caller treats as a transient `network-error`.
 */
async function readBoundedText(response: Response): Promise<string> {
  const body = response.body;
  if (!body) {
    return response.text();
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytesRead = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      // Take only up to the remaining budget from this chunk, so a body that
      // arrives in one large chunk is still bounded, not appended whole.
      const remaining = MAX_BODY_BYTES - bytesRead;
      const chunk =
        value.byteLength > remaining ? value.subarray(0, remaining) : value;
      // stream: true so a multi-byte character split across chunks decodes correctly.
      text += decoder.decode(chunk, {stream: true});
      bytesRead += chunk.byteLength;
      if (bytesRead >= MAX_BODY_BYTES) break;
    }
  } finally {
    // Stop downloading the remainder and free the socket for reuse.
    await reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

/**
 * Map a response media type to a content type rdf-parse understands, or `null`
 * when the response is plainly non-RDF binary (so a doomed parse is skipped).
 * rdf-parse does not sniff — it needs an explicit content type — so a generic or
 * mislabelled type is mapped to a best-effort serialisation rather than rejected
 * on the header alone: a JSON body is tried as JSON-LD, an XML body as RDF/XML,
 * and anything else text-ish (`text/plain`, octet-stream, no type) as Turtle
 * (which also accepts N-Triples). A type rdf-parse already knows passes through
 * unchanged. The body is then parsed to confirm it really is RDF (see
 * {@link bodyParsesAsRdf}), so a server that merely *claims* an RDF content type
 * cannot resolve on the header alone.
 */
function rdfParseContentType(mediaType: string): string | null {
  if (
    mediaType.startsWith('image/') ||
    mediaType.startsWith('video/') ||
    mediaType.startsWith('audio/') ||
    mediaType.startsWith('font/') ||
    mediaType === 'application/pdf' ||
    mediaType === 'application/zip'
  ) {
    return null;
  }
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    return 'application/ld+json';
  }
  if (
    mediaType === 'application/xml' ||
    mediaType === 'text/xml' ||
    mediaType.endsWith('+xml')
  ) {
    return 'application/rdf+xml';
  }
  if (
    mediaType === '' ||
    mediaType === 'text/plain' ||
    mediaType === 'application/octet-stream'
  ) {
    return 'text/turtle';
  }
  return mediaType;
}

/**
 * Whether `body` parses as at least one RDF quad under `contentType`. Uses
 * rdf-parse — the parser behind the project's `rdf-dereference` — so every
 * serialisation it supports (the Turtle family, JSON-LD, RDF/XML) is recognised,
 * not just the Turtle family. `body` is already bounded by {@link readBoundedText}.
 * `baseIri` resolves relative IRIs (the response's final, redirected URL). A
 * parser error, or zero quads, means “not RDF”.
 */
function bodyParsesAsRdf(
  body: string,
  contentType: string,
  baseIri: string,
): Promise<boolean> {
  return new Promise(resolve => {
    let parsed: Readable;
    try {
      parsed = rdfParser.parse(Readable.from([body]), {
        contentType,
        baseIRI: baseIri,
      }) as unknown as Readable;
    } catch {
      resolve(false);
      return;
    }
    let found = false;
    parsed.on('data', () => {
      found = true;
      parsed.destroy();
    });
    parsed.on('error', () => resolve(false));
    parsed.on('end', () => resolve(found));
    parsed.on('close', () => resolve(found));
  });
}

/**
 * Default resolution check: follow redirects and accept any `2xx` that is HTML
 * or RDF. An HTML page that advertises the original sampled URI (raw or
 * HTML-entity-escaped) is a {@link Resolution landing page} — a human-readable
 * page for the identifier, the permanent link back to the user, which matters
 * because we may have landed on a different, redirected URL. RDF (or HTML that
 * does not mention the URI) still resolves; it just is not a landing page. A
 * `2xx` that is neither HTML nor RDF is a `wrong-content-type` failure.
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
      headers: {accept: RESOLVE_ACCEPT},
      signal: abort,
    });
  } catch (error) {
    return {kind: 'failed', reason: classifyFetchError(error)};
  }
  if (!response.ok) {
    return {kind: 'failed', reason: classifyHttpStatus(response.status)};
  }

  const mediaType = mediaTypeOf(response);
  if (mediaType === 'text/html') {
    let body: string;
    try {
      body = await readBoundedText(response);
    } catch {
      // A `200 text/html` whose body cannot be read is a transport failure.
      return {kind: 'failed', reason: 'network-error'};
    }
    // A landing page advertises its own URI; HTML that does not still resolves.
    return {
      kind: 'resolved',
      landingPage: body.includes(uri) || body.includes(htmlEscape(uri)),
    };
  }
  // Not HTML: confirm the body parses as RDF. rdf-parse needs the content type,
  // so a generic or mislabelled one is mapped to a best-effort serialisation
  // (see rdfParseContentType); a plainly non-RDF binary type is rejected without
  // a parse. The parse — not the header — is the authority, so a server that only
  // claims an RDF content type but serves an error/HTML body does not resolve.
  const parseContentType = rdfParseContentType(mediaType);
  if (parseContentType === null) {
    return {kind: 'failed', reason: 'wrong-content-type'};
  }
  let body: string;
  try {
    body = await readBoundedText(response);
  } catch {
    return {kind: 'failed', reason: 'network-error'};
  }
  return (await bodyParsesAsRdf(body, parseContentType, response.url || uri))
    ? {kind: 'resolved', landingPage: false}
    : {kind: 'failed', reason: 'wrong-content-type'};
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
