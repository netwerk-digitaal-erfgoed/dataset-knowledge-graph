import {graphIriScheme} from './graphIri.js';

/**
 * Where DKG-generated SHACL validation reports live in the output store — one
 * graph per dataset (see {@link graphIriScheme} for the encoding). Used as the
 * `graphIri` callback on the n-quads {@link FileWriter} configured as a
 * `reportWriter` on {@link ShaclValidator}.
 */
const scheme = graphIriScheme(
  'https://data.netwerkdigitaalerfgoed.nl/dkg/shacl-validation/',
);

export const validationGraphIri = scheme.graphIri;
export const validationGraphPrefix = scheme.prefix;
