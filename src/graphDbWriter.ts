import {batch, serializeQuads} from '@lde/pipeline';
import type {Writer} from '@lde/pipeline';
import type {Dataset} from '@lde/dataset';
import type {Quad} from '@rdfjs/types';

export interface GraphDbWriterOptions {
  endpoint: URL;
  auth?: string;
  batchSize?: number;
}

/**
 * Writes RDF data to a GraphDB SPARQL endpoint.
 *
 * Fixes two issues with the upstream SparqlUpdateWriter:
 * 1. Clears the named graph only once per dataset (not before every stage write).
 *    Without this, each stage's write would wipe the previous stage's data.
 * 2. Logs write errors without throwing, so pipeline stages continue even when
 *    GraphDB is unavailable.
 */
export class GraphDbWriter implements Writer {
  private readonly endpoint: URL;
  private readonly auth?: string;
  private readonly batchSize: number;
  private readonly clearedGraphs = new Set<string>();

  constructor(options: GraphDbWriterOptions) {
    this.endpoint = options.endpoint;
    this.auth = options.auth;
    this.batchSize = options.batchSize ?? 10000;
  }

  async write(dataset: Dataset, quads: AsyncIterable<Quad>): Promise<void> {
    const graphUri = dataset.iri.toString();

    try {
      if (!this.clearedGraphs.has(graphUri)) {
        await this.executeUpdate(`CLEAR GRAPH <${graphUri}>`);
        this.clearedGraphs.add(graphUri);
      }

      for await (const chunk of batch(quads, this.batchSize)) {
        const turtleData = await serializeQuads(chunk, 'N-Triples');
        await this.executeUpdate(
          `INSERT DATA { GRAPH <${graphUri}> { ${turtleData} } }`,
        );
      }
    } catch (e) {
      console.warn(`GraphDB write failed for <${graphUri}>: ${e}`);
    }
  }

  private async executeUpdate(query: string): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/sparql-update',
    };
    if (this.auth) {
      headers['Authorization'] = this.auth;
    }
    const response = await fetch(this.endpoint.toString(), {
      method: 'POST',
      headers,
      body: query,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `SPARQL UPDATE failed with status ${response.status}: ${body}`,
      );
    }
  }
}
