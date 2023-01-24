import {QueryEngine} from '@comunica/query-sparql';
import {Bindings, DatasetCore, Quad, ResultStream} from 'rdf-js';
import {Store} from 'n3';
import {Dataset} from '../dataset';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {AsyncIterator} from 'asynciterator';
import {BindingsFactory} from '@comunica/bindings-factory';
import {DataFactory} from 'rdf-data-factory';
import {Analyzer,NotSupported,AnalyzerError} from '../analyzer';
import axios from 'axios';

export class DistributionLinksAnalyzer implements Analyzer {
  constructor() {}

  public static async init() {
    return new DistributionLinksAnalyzer();
  }

  
  public async execute(
    dataset: Dataset
  ): Promise<DatasetCore | NotSupported | AnalyzerError> {
    const distributionLinks = dataset.distributions.filter(
      distribution =>  distribution.accessUrl !== null
    );

    if (distributionLinks.length === 0) {
      return new NotSupported();
    }
    for (const link in distributionLinks) {
        const url = distributionLinks[link].accessUrl;
        const mimeType = distributionLinks[link].mimeType;
        if( mimeType == "application/sparql-query" || mimeType == "application/sparql-results+json" ) {
          console.info(
            `Test SPARQL enpoint ${url}`
          );
          const status = await testSparqlEndpoint(url);
          console.info(status);
        }
        else {
          console.info( 
            `Analyzing distribution links ${distributionLinks[link].accessUrl}`
          );
          const status = await httpHeadRequest(url);
          console.info(status);
        }
    }
    
    const store = new Store();
/*
    try {
      const stream = await this.tryQuery(
        sparqlDistributions[0].accessUrl!,
        dataset
      );
      store.addQuads(await stream.toArray());
    } catch (e) {
      return new AnalyzerError(
        sparqlDistributions[0].accessUrl!,
        e instanceof Error ? e.message : undefined
      );
    }
*/
    return store;
  }
}

async function testSparqlEndpoint(
  url: string | undefined 
): Promise<number> {
  if(url){
    try {
      const query = "SELECT * {?s ?p ?o} limit 1";
      const response = await axios.get(url,{
        params: {
            query: query
        }
      });
      //console.log(response.headers);
      return response.status;
    } 
    catch (err) {
      if(axios.isAxiosError(err) && err.response?.status){
          return err.response?.status;
      }
    }
    return -1;
  }
  return -2;
}

async function httpHeadRequest(
    url: string | undefined
): Promise<number> {
    if(url){
      try {
        const response = await axios.head(url);
        //console.log(response.headers);
        return response.status;
      } 
      catch (err) {
        if(axios.isAxiosError(err) && err.response?.status){
          // switch to a GET request when error response is 404 or 405 (Method not allowed)
          if(err.response.status == 404 || err.response.status == 405) {
            console.info('HEAD request returned 404/405, retrying with a GET request...');
            return await httpGetRequest(url);
          }
          else {
            return err.response?.status;
          }
          //console.error(error);
        }
        return -1;
    }
  }
  return -2;
}

async function httpGetRequest(
  url: string | undefined
): Promise<number> {
  if(url){
    try {
      const response = await axios.get(url);
      //console.log(response.headers);
      return response.status;
    } 
    catch (err) {
      if(axios.isAxiosError(err) && err.response?.status){
        return err.response?.status;
        //console.error(error);
      }
      return -1;
  }
}
return -1;
}


/*
  private async tryQuery(
    endpoint: string,
    dataset: Dataset,
    type?: string
  ): Promise<AsyncIterator<Quad> & ResultStream<Quad>> {
    try {
      return await new QueryEngine().queryQuads(this.query, {
        initialBindings: this.bindingsFactory.fromRecord({
          dataset: this.dataFactory.namedNode(dataset.iri),
        }) as unknown as Bindings,
        sources: [
          {
            type: 'sparql',
            value: endpoint,
          },
        ],
        httpTimeout: 300_000, // Some SPARQL queries really take this long.
      });
    } catch (e) {
      if (type !== undefined) {
        // Retry without explicit SPARQL type, which is needed for endpoints that offer a SPARQL Service Description.
        return await this.tryQuery(endpoint, dataset);
      }
      throw e;
    }
  }
}
*/
