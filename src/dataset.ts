export class Dataset {
  constructor(
    public readonly iri: string,
    public distributions: Distribution[],

    // On the level of the dataset instead of the distribution because distribution may not have a URI, so cannot be
    // referenced from supplemental.ttl.
    public subjectFilter?: string,
  ) {}

  public getSparqlDistribution(): Distribution | null {
    return (
      this.distributions.filter(
        distribution => distribution.isSparql() && distribution.isValid,
      )[0] ?? null
    );
  }

  public getDownloadDistributions(): Distribution[] {
    return this.distributions
      .filter(d => d.isValid)
      .map(distribution => ({
        distribution,
        priority: getDownloadDistributionPriority(distribution),
      }))
      .filter(item => item.priority !== null)
      .sort((a, b) => a.priority! - b.priority!)
      .map(item => item.distribution);
  }
}

export class Distribution {
  public mimeType?: string;
  public accessUrl?: string;
  public byteSize?: number;
  public lastModified?: Date;
  public isValid?: boolean;
  public namedGraph?: string;

  public isSparql() {
    return (
      (this.mimeType === 'application/sparql-query' ||
        this.mimeType === 'application/sparql-results+json') &&
      this.accessUrl !== null
    );
  }

  public static sparql(endpoint: string, namedGraph?: string) {
    const distribution = new this();
    distribution.mimeType = 'application/sparql-query';
    distribution.isValid = true;
    distribution.accessUrl = endpoint;
    distribution.namedGraph = namedGraph;

    return distribution;
  }
}

/**
 * Prefer streaming formats (NT) over non-streaming ones (Turtle) because the former can be processed in parallel by indexers.
 */
function getDownloadDistributionPriority(distribution: Distribution) {
  if (
    distribution.mimeType === 'application/n-triples' ||
    distribution.mimeType === 'application/n-triples+gzip' ||
    distribution.mimeType ===
      'https://www.iana.org/assignments/media-types/application/n-triples'
  ) {
    return 1;
  }

  if (distribution.accessUrl?.endsWith('.nt.gz')) {
    return 2;
  }

  if (distribution.mimeType?.endsWith('+gzip')) {
    return 3;
  }

  if (distribution.mimeType === 'text/turtle') {
    return 4;
  }

  return null;
}
