/**
 * Single source of truth for how an IIIF Presentation manifest is recognised
 * from a `schema:encodingFormat` literal. Both the IIIF criterion
 * (`queries/analysis/iiif.rq`) and the subject-URI resolution check
 * (`subjectUriResolution.ts`) build their manifest test from these helpers, so
 * the two cannot drift: a drift would let one URL be both a passing IIIF
 * manifest and a failing “persistent identifier” (the green/red contradiction
 * the exclusion exists to prevent).
 *
 * Each helper returns a SPARQL boolean expression over `?{formatVariable}`,
 * ready to drop inside a `FILTER(…)`. Matched with `STRSTARTS`/`CONTAINS` rather
 * than a regex, which is costly on QLever and on remote endpoints alike.
 */

/**
 * The IIIF Presentation profile media type: a JSON-LD type whose `profile`
 * parameter points at an `iiif.io/api/presentation/{version}` context. The
 * version segment is left unconstrained — intentionally forwards-compatible with
 * future Presentation API versions.
 *
 * The match is deliberately serialization-agnostic. The `profile` parameter
 * names the same context URI however it is written, but real data wraps it two
 * ways: the SCHEMA-AP-NDE / Linked Art convention uses single quotes and no
 * space (`;profile='…'`), while the HTTP/MIME- and JSON-LD-conformant form uses
 * double quotes and may carry whitespace after the `;` (`; profile="…"`). One
 * dataset can even expose both — RMO serves single quotes from its endpoint but
 * double quotes in its data dump. So rather than anchoring on the quote or the
 * whitespace, we anchor on the parts that never vary: the `application/ld+json`
 * type prefix (cheap, and fails fast on the `image/*` majority) and the two
 * stable URI substrings on either side of the version segment. This also matches
 * the unquoted form. `CONTAINS` replaces the previous `STRENDS` for the same
 * performance reason the helpers avoid `REGEX`.
 */
export function iiifProfileFormatMatch(formatVariable: string): string {
  return `STRSTARTS(STR(?${formatVariable}), "application/ld+json")
        && CONTAINS(STR(?${formatVariable}), "iiif.io/api/presentation/")
        && CONTAINS(STR(?${formatVariable}), "/context.json")`;
}

/**
 * Capability test — what counts as an IIIF manifest at all: the
 * {@link iiifProfileFormatMatch profile pattern} *or* the bare
 * `application/ld+json` media type (issue #314: a functional manifest declared
 * without the `;profile=` parameter must still count). This is the test the
 * subject-URI sampler mirrors to exclude manifests.
 */
export function iiifManifestFormatFilter(formatVariable: string): string {
  return `isLiteral(?${formatVariable}) && (
        (${iiifProfileFormatMatch(formatVariable)})
        || STR(?${formatVariable}) = "application/ld+json"
      )`;
}

/**
 * Conformance test — the stricter SCHEMA-AP-NDE subset: only the full profile
 * pattern conforms; the bare JSON-LD type does not. `conformant ⊆ capability`.
 */
export function iiifConformantFormatFilter(formatVariable: string): string {
  return `isLiteral(?${formatVariable})
        && ${iiifProfileFormatMatch(formatVariable)}`;
}
