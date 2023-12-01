import {SummaryWriter} from '../writer.js';
import {DatasetCore} from 'rdf-js';
import {Dataset} from '../dataset.js';
import graphdb from 'graphdb';
import RDFRepositoryClient from 'graphdb/lib/repository/rdf-repository-client.js';
import {AxiosError} from 'axios';

export class SparqlWriter implements SummaryWriter {
  constructor(private sparqlClient: SparqlClient) {}

  async write(dataset: Dataset, summary: DatasetCore): Promise<void> {
    this.sparqlClient.store(dataset, summary);
  }
}

interface SparqlClient {
  store(dataset: Dataset, summary: DatasetCore): void;
}

export class GraphDBClient implements SparqlClient {
  private repository: RDFRepositoryClient;

  constructor(config: {
    url: string;
    username: string;
    password: string;
    repository: string;
  }) {
    const graphdbConfig = new graphdb.repository.RepositoryClientConfig(
      config.url
    )
      .useGdbTokenAuthentication(config.username, config.password)
      .setEndpoints([config.url + '/repositories/' + config.repository]);
    this.repository = new graphdb.repository.RDFRepositoryClient(graphdbConfig);
  }

  async store(dataset: Dataset, summary: DatasetCore): Promise<void> {
    try {
      await this.repository.putQuads([...summary], dataset.iri);
    } catch (e) {
      console.error(
        'Write to GraphDB failed for dataset ' + dataset.iri,
        (e as AxiosError).message,
        (e as AxiosError).response?.data
      );
    }
  }
}
