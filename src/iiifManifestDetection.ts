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
 * ready to drop inside a `FILTER(…)`. Matched with `STRSTARTS`/`STRENDS` rather
 * than a regex, which is costly on QLever and on remote endpoints alike.
 */

/**
 * The IIIF Presentation profile media type: a JSON-LD type whose `;profile=`
 * parameter points at an `iiif.io/api/presentation/{version}` context. The
 * version segment is left unconstrained — intentionally forwards-compatible with
 * future Presentation API versions.
 */
export function iiifProfileFormatMatch(formatVariable: string): string {
  return `STRSTARTS(STR(?${formatVariable}), "application/ld+json;profile='http://iiif.io/api/presentation/")
        && STRENDS(STR(?${formatVariable}), "/context.json'")`;
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
