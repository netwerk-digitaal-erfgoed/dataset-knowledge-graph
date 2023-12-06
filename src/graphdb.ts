import RDFRepositoryClient from 'graphdb/lib/repository/rdf-repository-client.js';
import graphdb from 'graphdb';
import {Dataset} from './dataset.js';
import {DatasetCore} from 'rdf-js';
import {SparqlClient as WriterSparqlClient} from './writer/sparql.js';
import {SparqlClient as ImporterSparqlClient} from './importer.js';
import {AxiosError} from 'axios';

export class GraphDBClient implements WriterSparqlClient, ImporterSparqlClient {
  private repository: RDFRepositoryClient;
  private endpoint: string;

  constructor(config: {
    url: string;
    username: string;
    password: string;
    repository: string;
  }) {
    this.endpoint = config.url + '/repositories/' + config.repository;
    const graphdbConfig = new graphdb.repository.RepositoryClientConfig(
      config.url
    )
      .useGdbTokenAuthentication(config.username, config.password)
      .setEndpoints([this.endpoint]);
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

  async import(dataset: Dataset, distributionUrl: string): Promise<void> {
    console.info(`  Importing ${distributionUrl}`);

    try {
      await this.repository.update(
        new graphdb.query.UpdateQueryPayload()
          .setQuery(
            `CLEAR GRAPH <${dataset.iri}>; LOAD <${distributionUrl}> INTO GRAPH <${dataset.iri}>`
          )
          .setInference(false)
          .setTimeout(60)
      );
    } catch (e) {
      console.error(
        `Import to GraphDB failed for dataset ${dataset.iri} with distribution URL ${distributionUrl}`,
        (e as AxiosError).message,
        (e as AxiosError).response?.data
      );
    }
  }

  getEndpoint(): string {
    return this.endpoint;
  }
}
