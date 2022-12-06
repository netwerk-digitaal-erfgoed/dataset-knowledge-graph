import {QueryEngine} from '@comunica/query-sparql';
import {DatasetCore} from 'rdf-js';
import {Store} from 'n3';

export interface Analyzer {
  execute(dataset: string): Promise<DatasetCore>;
}

export class SparqlQueryAnalyzer implements Analyzer {
  constructor(
    private readonly queryEngine: QueryEngine,
    private readonly query: string
  ) {}

  public async execute(dataset: string): Promise<DatasetCore> {
    const stream = await this.queryEngine.queryQuads(this.query, {
      sources: [dataset],
    });
    const store = new Store();
    store.import(stream);

    return store;
  }
}
