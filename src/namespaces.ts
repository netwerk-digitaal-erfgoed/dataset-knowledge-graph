import namespace from '@rdfjs/namespace';

/**
 * def.nde.nl vocabularies (see https://def.nde.nl/), shared across stages so
 * each base IRI lives in one place. Standard terms (rdf, dqv, prov, xsd,
 * dcterms, void) come from the bundled `@tpluscode/rdf-ns-builders` vocabularies.
 */
export const metric = namespace('https://def.nde.nl/metric#');
export const probe = namespace('https://def.nde.nl/probe#');
export const failure = namespace('https://def.nde.nl/failure#');
export const resolution = namespace('https://def.nde.nl/resolution#');
