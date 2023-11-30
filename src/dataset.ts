export class Dataset {
  constructor(
    public readonly iri: string,
    public distributions: Distribution[]
  ) {}

  public getSparqlDistribution(): Distribution | null {
    return (
      this.distributions.filter(distribution => distribution.isSparql())[0] ??
      null
    );
  }

  public getDownloadDistribution(): Distribution | null {
    return (
      this.distributions.filter(
        distribution => distribution.mimeType?.endsWith('+gzip')
      )[0] ??
      this.distributions.filter(
        distribution => distribution.accessUrl?.endsWith('.nt.gz')
      )[0] ??
      this.distributions.filter(
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

  public isSparql() {
    return (
      (this.mimeType === 'application/sparql-query' ||
        this.mimeType === 'application/sparql-results+json') &&
      this.accessUrl !== null
    );
  }
}
