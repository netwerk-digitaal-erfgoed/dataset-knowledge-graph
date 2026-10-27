import {describe, expect, it} from 'vitest';
import {replaceSchemaOrgContext} from '../src/schemaOrgContext.js';

describe('replaceSchemaOrgContext', () => {
  it.each([
    'https://schema.org',
    'http://schema.org/',
    'https://schema.org/docs/jsonldcontext.json',
    'https://schema.org/docs/jsonldcontext.jsonld',
    'https://schema.org/version/30.1/schemaorg-current-https.jsonld',
    'https://def.nde.nl/context.jsonld',
  ])('answers %s with the NDE context', url => {
    expect(replaceSchemaOrgContext(url)).toMatchObject({
      '@context': expect.objectContaining({
        license: expect.objectContaining({'@type': '@id'}),
      }),
    });
  });

  it.each([
    'https://schema.org/Person',
    'https://example.org/context.jsonld',
    'not a url',
  ])('leaves %s to be fetched', url => {
    expect(replaceSchemaOrgContext(url)).toBeUndefined();
  });
});
