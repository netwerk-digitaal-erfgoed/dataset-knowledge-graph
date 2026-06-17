import {graphIriScheme} from './graphIri.js';

/**
 * Where DKG-generated RDF-validity verdicts live in the output store — one graph
 * per dataset (see {@link graphIriScheme} for the encoding). Kept in its own
 * graph, rather than the dataset’s summary graph, because the verdict carries
 * report-grade diagnostic detail (the typed `failure:reason` and the parser
 * `failure:message`), mirroring how the SHACL validation reports are segregated.
 * For a distribution whose RDF failed to import, this graph holds the only DKG
 * output the dataset has. Used as the `graphIri` callback on the post-run
 * validity {@link FileWriter}.
 */
const scheme = graphIriScheme(
  'https://data.netwerkdigitaalerfgoed.nl/dkg/distribution-validity/',
);

export const validityGraphIri = scheme.graphIri;
export const validityGraphPrefix = scheme.prefix;
