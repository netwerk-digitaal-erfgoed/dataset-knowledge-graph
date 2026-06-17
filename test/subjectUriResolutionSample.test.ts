import {describe, it, expect} from 'vitest';
import {Parser, Store} from 'n3';
import {QueryEngine} from '@comunica/query-sparql-rdfjs-lite';
import {buildSampleQuery} from '../src/subjectUriResolution.js';

// The DKOR case: an ARK namespace whose subjects include both genuine resources
// and IIIF manifest URLs (`…/{uuid}/iiif.json`). The manifests pass the IIIF
// criterion but, serving JSON rather than text/html, would fail the subject-URI
// resolution check as `wrong-content-type` — so the sampler must exclude them.
const URI_SPACE = 'https://n2t.net/ark:/85849/';

const PREFIXES = '@prefix schema: <https://schema.org/> .\n';

async function sample(turtle: string, limit = 10): Promise<string[]> {
  const store = new Store();
  store.addQuads(new Parser().parse(PREFIXES + turtle));

  const engine = new QueryEngine();
  const bindings = await engine.queryBindings(
    buildSampleQuery(URI_SPACE, limit, ''),
    {sources: [store]},
  );
  const subjects: string[] = [];
  for await (const binding of bindings) {
    const term = binding.get('s');
    if (term?.termType === 'NamedNode') subjects.push(term.value);
  }
  return subjects.sort();
}

const IIIF_V3 =
  "application/ld+json;profile='http://iiif.io/api/presentation/3/context.json'";

describe('buildSampleQuery IIIF manifest exclusion', () => {
  it('excludes manifest URLs that bear the IIIF encodingFormat themselves', async () => {
    const turtle = `
      <${URI_SPACE}aaa> schema:name "Work A" .
      <${URI_SPACE}bbb> schema:name "Work B" .
      <${URI_SPACE}aaa/iiif.json> schema:encodingFormat "${IIIF_V3}" .
      <${URI_SPACE}bbb/iiif.json> schema:encodingFormat "${IIIF_V3}" .
    `;

    // Only the genuine subjects survive; the two iiif.json manifests are dropped.
    expect(await sample(turtle)).toEqual([
      `${URI_SPACE}aaa`,
      `${URI_SPACE}bbb`,
    ]);
  });

  it('excludes a manifest declared with the bare application/ld+json media type', async () => {
    const turtle = `
      <${URI_SPACE}aaa> schema:name "Work A" .
      <${URI_SPACE}aaa/iiif.json> schema:encodingFormat "application/ld+json" .
    `;

    expect(await sample(turtle)).toEqual([`${URI_SPACE}aaa`]);
  });

  it('excludes a manifest URL referenced via schema:contentUrl', async () => {
    // The encodingFormat sits on a wrapper node; the dereferenceable manifest
    // URL lives in schema:contentUrl and is itself a subject in the namespace.
    const turtle = `
      <${URI_SPACE}ccc> schema:associatedMedia [
        schema:encodingFormat "${IIIF_V3}" ;
        schema:contentUrl <${URI_SPACE}ccc/manifest.json>
      ] .
      <${URI_SPACE}ccc/manifest.json> schema:name "Manifest" .
    `;

    // The work survives; the contentUrl manifest is dropped.
    expect(await sample(turtle)).toEqual([`${URI_SPACE}ccc`]);
  });

  it('keeps non-IIIF media subjects (e.g. plain images)', async () => {
    const turtle = `
      <${URI_SPACE}aaa> schema:name "Work A" .
      <${URI_SPACE}eee> schema:encodingFormat "image/jpeg" .
    `;

    // Only IIIF manifests are excluded — a plain media object stays sampled.
    expect(await sample(turtle)).toEqual([
      `${URI_SPACE}aaa`,
      `${URI_SPACE}eee`,
    ]);
  });

  it('leaves a manifest-free namespace untouched', async () => {
    const turtle = `
      <${URI_SPACE}aaa> schema:name "Work A" .
      <${URI_SPACE}bbb> schema:name "Work B" .
    `;

    expect(await sample(turtle)).toEqual([
      `${URI_SPACE}aaa`,
      `${URI_SPACE}bbb`,
    ]);
  });

  it('backfills the sample with genuine subjects up to the limit', async () => {
    // With manifests excluded at the source, a small LIMIT is filled with real
    // subjects rather than partly wasted on manifests (the DKOR 6/6 outcome).
    const turtle = `
      <${URI_SPACE}aaa> schema:name "Work A" .
      <${URI_SPACE}bbb> schema:name "Work B" .
      <${URI_SPACE}ccc> schema:name "Work C" .
      <${URI_SPACE}aaa/iiif.json> schema:encodingFormat "${IIIF_V3}" .
      <${URI_SPACE}bbb/iiif.json> schema:encodingFormat "${IIIF_V3}" .
    `;

    expect(await sample(turtle, 2)).toHaveLength(2);
  });
});

describe('buildSampleQuery URI space prefix exclusion', () => {
  it('excludes the URI space prefix itself while keeping genuine subjects', async () => {
    // The prefix appears as a subject in the data (e.g. `…/61567/dataset`
    // strips to `…/61567/`). STRSTARTS matches it against itself, but the
    // prefix is the namespace, not a dereferenceable resource, so it must be
    // dropped.
    const turtle = `
      <${URI_SPACE}> schema:name "The ARK namespace" .
      <${URI_SPACE}aaa> schema:name "Work A" .
      <${URI_SPACE}bbb> schema:name "Work B" .
    `;

    expect(await sample(turtle)).toEqual([
      `${URI_SPACE}aaa`,
      `${URI_SPACE}bbb`,
    ]);
  });
});
