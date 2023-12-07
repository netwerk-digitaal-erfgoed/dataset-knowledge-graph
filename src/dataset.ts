export class Dataset {
  constructor(
    public readonly iri: string,
    public distributions: Distribution[],

    // On the level of the dataset instead of the distribution because distribution may not have a URI, so cannot be
    // referenced from supplemental.ttl.
    public subjectFilter?: string
  ) {}

  public getSparqlDistribution(): Distribution | null {
    return (
      this.distributions.filter(
        distribution => distribution.isSparql() && distribution.isValid
      )[0] ?? null
    );
  }

  public getDownloadDistribution(): Distribution | null {
    const validDistributions = this.distributions.filter(
      distribution => distribution.isValid
    );

    return (
      validDistributions.filter(
        distribution => distribution.mimeType?.endsWith('+gzip')
      )[0] ??
      validDistributions.filter(
        distribution => distribution.accessUrl?.endsWith('.nt.gz')
      )[0] ??
      validDistributions.filter(
        distribution =>
          undefined !== distribution.mimeType &&
          ['application/n-triples', 'text/turtle'].includes(
            distribution.mimeType
          )
      )[0] ??
      null
    );
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

  public static sparql(endpoint: string, namedGraph: string) {
    const distribution = new this();
    distribution.mimeType = 'application/sparql-query';
    distribution.isValid = true;
    distribution.accessUrl = endpoint;
    distribution.namedGraph = namedGraph;

    return distribution;
  }
}
