export class Dataset {
  constructor(
    public readonly iri: string,
    public distributions: Distribution[]
  ) {}
}

export class Distribution {
  public mimeType?: string;
  public accessUrl?: string;
}
