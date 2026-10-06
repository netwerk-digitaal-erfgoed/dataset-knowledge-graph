import {describe, it, expect} from 'vitest';
import {Parser, Store} from 'n3';
import {QueryEngine} from '@comunica/query-sparql-rdfjs-lite';
import {
  buildMediaQuery,
  buildSampleQuery,
} from '../src/subjectUriResolution.js';

// The DKOR case: an ARK namespace whose subjects include both genuine resources
// and IIIF manifest URLs (`…/{uuid}/iiif.json`). The manifests pass the IIIF
// criterion but, serving JSON rather than text/html, would fail the subject-URI
// resolution check as `wrong-content-type` — so the sampler must exclude them.
const URI_SPACE = 'https://n2t.net/ark:/85849/';

const PREFIXES = '@prefix schema: <https://schema.org/> .\n';

async function sample(turtle: string, limit = 10): Promise<string[]> {
  return select(turtle, buildSampleQuery(URI_SPACE, limit, ''));
}

async function select(turtle: string, query: string): Promise<string[]> {
  const store = new Store();
  store.addQuads(new Parser().parse(PREFIXES + turtle));

  const engine = new QueryEngine();
  const bindings = await engine.queryBindings(query, {sources: [store]});
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

describe('buildMediaQuery', () => {
  // The KLEKSI case: media files live on a CDN host as subjects of their own.
  // They are file locations, not identifiers for the dataset’s records, so the
  // persistence check drops them from its sample.
  async function media(
    turtle: string,
    candidates: string[],
  ): Promise<string[]> {
    return select(turtle, buildMediaQuery(candidates));
  }

  it('identifies associatedMedia targets', async () => {
    const turtle = `
      <${URI_SPACE}aaa> schema:associatedMedia <${URI_SPACE}scan> .
      <${URI_SPACE}bbb> <http://schema.org/associatedMedia> <${URI_SPACE}audio> .
      <${URI_SPACE}scan> schema:contentUrl <https://cdn.example.org/scan.jpg> .
      <${URI_SPACE}audio> schema:contentUrl <https://cdn.example.org/audio.mp3> .
    `;

    expect(
      await media(turtle, [
        `${URI_SPACE}aaa`,
        `${URI_SPACE}bbb`,
        `${URI_SPACE}scan`,
        `${URI_SPACE}audio`,
      ]),
    ).toEqual([`${URI_SPACE}audio`, `${URI_SPACE}scan`]);
  });

  it('identifies EDM web resources', async () => {
    const turtle = `
      @prefix edm: <http://www.europeana.eu/schemas/edm/> .
      <${URI_SPACE}aaa> a edm:ProvidedCHO .
      <${URI_SPACE}webresource> a edm:WebResource .
    `;

    expect(
      await media(turtle, [`${URI_SPACE}aaa`, `${URI_SPACE}webresource`]),
    ).toEqual([`${URI_SPACE}webresource`]);
  });

  it('identifies IIIF Image API descriptors', async () => {
    // KLEKSI links each image to its `info.json` with rdfs:seeAlso; the
    // descriptor is untyped and recognisable only by its encodingFormat.
    const turtle = `
      <${URI_SPACE}aaa> schema:name "Work A" .
      <${URI_SPACE}image/info.json> schema:encodingFormat
        "application/ld+json;profile='http://iiif.io/api/image/3/context.json'" .
    `;

    expect(
      await media(turtle, [`${URI_SPACE}aaa`, `${URI_SPACE}image/info.json`]),
    ).toEqual([`${URI_SPACE}image/info.json`]);
  });

  it('does not treat records typed as a media class as media', async () => {
    // A photo or AV archive may type its records as ImageObject or VideoObject,
    // and link them with schema:image; those are the records to sample.
    const turtle = `
      <${URI_SPACE}photo> a schema:ImageObject ; schema:name "Photo" .
      <${URI_SPACE}video> a schema:VideoObject ; schema:name "Video" .
      <${URI_SPACE}person> schema:image <${URI_SPACE}photo> .
    `;

    expect(
      await media(turtle, [`${URI_SPACE}photo`, `${URI_SPACE}video`]),
    ).toEqual([]);
  });

  it('only looks up the given candidates', async () => {
    const turtle = `
      <${URI_SPACE}aaa> schema:associatedMedia <${URI_SPACE}scan> .
    `;

    expect(await media(turtle, [`${URI_SPACE}aaa`])).toEqual([]);
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
