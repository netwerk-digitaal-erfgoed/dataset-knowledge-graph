import pRetry from 'p-retry';
import {QueryEngine} from '@comunica/query-sparql-file';

const queryEngine = new QueryEngine();

export async function waitForSparqlEndpointAvailable(
  url: string,
  options: {retries: number} = {retries: 5}
) {
  const query = 'SELECT * WHERE { ?s ?p ?o } LIMIT 1';
  let results;
  await pRetry(
    async () => {
      try {
        const result = await queryEngine.queryBindings(query, {
          sources: [
            {
              type: 'sparql',
              value: url,
            },
          ],
        });

        results = await result.toArray();
      } catch (e) {
        throw new Error(`SPARQL endpoint at ${url} not available`);
      }

      if (results.length === 0) {
        throw new Error(`No data loaded (based on query ${query})`);
      }
    },
    {retries: options.retries}
  );
}
