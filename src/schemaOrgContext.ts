/**
 * Schema.org release 30.1 removed every `@type` from its published JSON-LD
 * context (schemaorg/schemaorg#4854), so under `"@context": "https://schema.org"`
 * a `license` or `contentUrl` IRI now parses to a string literal and a date to
 * `xsd:string`. The parser fetches that context while importing, so the change
 * reached the knowledge graph without a deploy and turned valid JSON-LD datasets
 * invalid.
 *
 * We answer Schema.org’s context URLs from the NDE context instead: the same
 * file the Dataset Register bundles and publishes at
 * https://def.nde.nl/context.jsonld, so a dataset gets the same verdict here as
 * in the register.
 */
import schemaOrgContext from './schemaOrgContext.json' with {type: 'json'};

const PUBLISHED_CONTEXT_URL = 'https://def.nde.nl/context.jsonld';

/**
 * Schema.org serves its context from the apex, from
 * `docs/jsonldcontext.json(ld)` and from `version/<release>/*.jsonld`, so match
 * the shape of those paths rather than enumerate them – the register’s
 * enumeration went stale twice.
 */
const schemaOrgContextPath =
  /^\/(?:|docs\/jsonldcontext\.json(?:ld)?|version\/[^/]+\/[^/]+\.jsonld)$/;

/**
 * The NDE context for a Schema.org (or NDE) context URL; `undefined` for any
 * other context, which is then fetched as usual.
 */
export function replaceSchemaOrgContext(url: string): object | undefined {
  const parsed = URL.parse(url);
  if (parsed === null) return undefined;
  return parsed.href === PUBLISHED_CONTEXT_URL ||
    (parsed.host === 'schema.org' && schemaOrgContextPath.test(parsed.pathname))
    ? schemaOrgContext
    : undefined;
}
