export class Pipeline {
  constructor(private readonly analyses: Analyzer[]) {}

  public async execute(): Promise<null> {
    return null;
  }
}
