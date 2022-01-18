import fetch, {Headers, Response} from 'node-fetch';
import querystring from 'querystring';
import {Distribution, DistributionList} from './distribution';
import {URL} from 'url';
import fs from 'fs';

export type SparqlResult = {
  results: {
    bindings: Binding[];
  };
};

export type Binding = {
  [key: string]: {value: string};
};

/* Example importstatus
    {
        "name":"https://lod.uba.uva.nl/UB-UVA/Music/download.nt.gz",
        "status":"DONE",
        "message":"Imported successfully in 6s.",
        "context":"https://lod.uba.uva.nl/UB-UVA/Music",
        "replaceGraphs":[],
        "baseURI":null,
        "forceSerial":false,
        "type":"url",
        "format":null,
        "data":"https://lod.uba.uva.nl/UB-UVA/Music/download.nt.gz",
        "timestamp":1639507272039,
        "parserSettings":{
            "preserveBNodeIds":false,
            "failOnUnknownDataTypes":false,
            "verifyDataTypeValues":false,
            "normalizeDataTypeValues":false,
            "failOnUnknownLanguageTags":false,
            "verifyLanguageTags":true,
            "normalizeLanguageTags":false,
            "stopOnError":true
        },
        "requestIdHeadersToForward":null
    }
*/

export type ImportStatus = {
  name: string;
  status: string;
  message: string;
  context: string;
  replaceGraphs: Array<string>;
  baseURI: string;
  forceSerial: boolean;
  type: string;
  format: string;
  data: string;
  timestamp: number;
  parserSettings: {
    preserveBNodeIds: boolean;
    failOnUnknownDataTypes: boolean;
    verifyDataTypeValues: boolean;
    normalizeDataTypeValues: boolean;
    failOnUnknownLanguageTags: boolean;
    verifyLanguageTags: boolean;
    normalizeLanguageTags: boolean;
    stopOnError: boolean;
  };
  requestIdHeadersToForward: string;
};

export type ImportStatusList = [status: ImportStatus];

/**
 * GraphDB client that uses the REST API.
 *
 * @see https://triplestore.netwerkdigitaalerfgoed.nl/webapi
 */
export class GraphDbClient {
  private token?: string;
  private username?: string;
  private password?: string;

  constructor(private url: string, private repository: string) {
    // Doesn't work with authentication: see https://github.com/Ontotext-AD/graphdb.js/issues/123
    // const config = new graphdb.repository.RepositoryClientConfig()
    //   .setEndpoints([url])
    //   .setUsername(username)
    //   .setPass(password);
    // this.repository = new graphdb.repository.RDFRepositoryClient(config);
  }

  public async authenticate(username: string, password: string) {
    this.username = username;
    this.password = password;

    const response = await fetch(this.url + '/rest/login/' + this.username, {
      method: 'POST',
      headers: {'X-Graphdb-Password': this.password!},
    });

    if (!response.ok) {
      throw Error(
        'Could not authenticate username ' +
          this.username +
          ' with GraphDB; got status code ' +
          response.status
      );
    }

    this.token = response.headers.get('Authorization')!;
  }

  public async request(
    method: string,
    url: string,
    body?: string,
    accept?: string,
    contentType?: string
  ): Promise<Response> {
    const headers = await this.getHeaders();
    headers.set('Content-Type', 'application/x-trig');
    if (accept) {
      headers.set('Accept', accept);
    }
    if (contentType) {
      headers.set('Content-Type', contentType)
    }
    const repositoryUrl = this.url + '/repositories/' + this.repository + url;
    const response = await fetch(repositoryUrl, {
      method: method,
      headers: headers,
      body: body,
    });
    if (
      // 409 = `Auth token hash mismatch`, which occurs after GraphDB has restarted.
      (response.status === 401 || response.status === 409) &&
      this.username !== undefined &&
      this.password !== undefined
    ) {
      this.token = undefined;
      // Retry original request.
      await this.request(method, url, body);
    }

    if (!response.ok) {
      console.error(
        'HTTP error ' + response.status + ' for ' + method + ' ' + repositoryUrl
      );
    }

    return response;
  }

  public async removeNamedGraph(dataset: string): Promise<Response> {
    const update = 'CLEAR GRAPH <' + dataset + '>';
    const response = await this.request(
      'POST',
      '/statements',
      update,
      undefined,
      'application/sparql-update'
    );

    return response;
  }

  public async checkDistUrl( distribution: string ): Promise<Response> {
    try {
      const response = await fetch( distribution, { method: 'HEAD' } );
      return response;
    } catch (e) {
      return <Response>{};
    }
  }

  public async import(
    dataset: string,
    distribution: string
  ): Promise<Response> {
    const headers = await this.getHeaders();
    headers.set('Content-Type', 'application/json');
    const payload = {
      context: distribution,
      data: distribution,
      name: distribution,
      replaceGraph: distribution,
    };
    const repositoryUrl =
      'http://localhost:7200/rest/data/import/upload/' +
      this.repository +
      '/url';
    try {
      const response = await fetch(repositoryUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });
      return response;
    } catch (error) {
      console.error(
        'HTTP error ' + error + ' for ' + payload + ' ' + repositoryUrl
      );
      return <Response>{};
    }
  }

  public async importStatus(): Promise<ImportStatusList> {
    const headers = await this.getHeaders();
    headers.set('Content-Type', 'application/json');
    const repositoryUrl =
      'http://localhost:7200/rest/data/import/upload/kg-temp';
    try {
      const response = await fetch(repositoryUrl, {
        method: 'GET',
        headers: headers,
      });
      return (await response.json()) as ImportStatusList;
    } catch (error) {
      console.error('HTTP error ' + error + ' for ' + repositoryUrl);
      return <ImportStatusList>[{}];
    }
  }

  public async query(query: string): Promise<SparqlResult> {
    const response = await this.request(
      'GET',
      '?' + querystring.stringify({query}),
      undefined,
      'application/sparql-results+json'
    );

    return (await response.json()) as SparqlResult;
  }

  public async update(update: string): Promise<Response> {
    const response = await this.request(
      'POST',
      '/statements',
      update,
      undefined,
      'application/sparql-update'
    );
    return response;
  }

  private async getHeaders(): Promise<Headers> {
    if (this.username === undefined || this.password === undefined) {
      return new Headers();
    }

    if (this.token === undefined) {
      await this.authenticate(this.username, this.password);
    }

    return new Headers({Authorization: this.token!});
  }

  public async analyseQuery(
    filename: string,
    dist: string,
    dataset: string,
    checkresult: boolean =false,
    importStatus: string ='',
  ): Promise<boolean> {
    const queryFile = fs.readFileSync('./queries/' + filename).toString();
    const re_dist = /distribution/g;
    const re_dataset = /dataset/g;
    const re_importStatus = /importStatus/g;
    const sparqlUpdateQuery = queryFile
      .replace(re_dataset, dataset)
      .replace(re_dist, dist)
      .replace(re_importStatus, importStatus);
    const result = await this.update(sparqlUpdateQuery);
    if (result.status !== 204) {
      console.log('Error: problems running the analyse queries for: ' + dist);
      return false;
    }
    if( !checkresult ) {
      return true;
    }
    const doneQuery = fs.readFileSync('./queries/analysis-done.rq').toString();
    const re_filename = /filename/g;
    const sparqlQuery = doneQuery
      .replace(re_dataset, dataset)
      .replace(re_filename,filename)
    let results = 0;
    while( results === 0 ) {
      const done = await this.query(sparqlQuery)
      results = done.results.bindings.length
      if( results === 0 ) {
        console.log('waiting...')
      }
    }
    return true;
  }
}

export class GraphDbDistributionList implements DistributionList {
  constructor(private client: GraphDbClient) {}

  async getDistributionList(): Promise<Distribution[]> {
    const result = await this.client.query(`
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    
    SELECT DISTINCT ?dataset_uri ?distribution_url  WHERE { 
      ?dataset_uri a dcat:Dataset . 
      ?dataset_uri dcat:distribution ?distribution_uri . 
      ?distribution_uri dct:format ?distribution_format . 
      ?distribution_uri dcat:accessURL ?distribution_url 
      FILTER( ?distribution_format="application/n-triples" ) 
    } 
    ORDER BY ?dataset`);

    return result.results.bindings.map(
      binding =>
        new Distribution(
          new URL(binding.dataset_uri.value),
          new URL(binding.distribution_url.value)
        )
    );
  }
}
