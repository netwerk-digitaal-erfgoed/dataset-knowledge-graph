import RDFRepositoryClient from 'graphdb/lib/repository/rdf-repository-client.js';
import graphdb from 'graphdb';
import {Dataset} from './dataset.js';
import {SparqlClient as WriterSparqlClient} from './writer/sparql.js';
import {
  ImportFailed,
  ImportSuccessful,
  SparqlClient as ImporterSparqlClient,
} from './importer.js';
import {AxiosError} from 'axios';
import {DatasetCore} from '@rdfjs/types';

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
      .setEndpoints([this.endpoint])
      .setWriteTimeout(180000); // Larger timeout for data dump imports.
    this.repository = new graphdb.repository.RDFRepositoryClient(graphdbConfig);
  }

  async store(dataset: Dataset, summary: DatasetCore): Promise<void> {
    try {
      await this.repository.putQuads(
        [...summary],
        dataset.iri,
        `<${dataset.iri}>`
      );
    } catch (e) {
      console.error(
        'Write to GraphDB failed for dataset ' + dataset.iri,
        (e as AxiosError).message,
        (e as AxiosError).response?.data
      );
    }
  }

  async import(
    dataset: Dataset,
    distributionUrl: string
  ): Promise<ImportSuccessful | ImportFailed> {
    console.info(`  Importing ${distributionUrl}`);

    const namedGraph = dataset.iri;
    try {
      await this.repository.update(
        new graphdb.query.UpdateQueryPayload()
          .setQuery(
            `CLEAR GRAPH <${namedGraph}>; LOAD <${distributionUrl}> INTO GRAPH <${namedGraph}>`
          )
          .setInference(false)
      );
    } catch (e) {
      const error = e as AxiosError;
      console.error(
        `Import to GraphDB failed for dataset ${dataset.iri} with distribution URL ${distributionUrl}`,
        error.message,
        error.response?.data
      );
      return new ImportFailed(
        distributionUrl,
        (error.response?.data as string) ?? error.message
      );
    }
    return new ImportSuccessful(this.endpoint, namedGraph);
  }
}
