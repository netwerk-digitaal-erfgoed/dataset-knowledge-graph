import {GraphDBClient} from '../src/graphdb';
import {Dataset} from '../src/dataset';
import {QueryEngine} from '@comunica/query-sparql-file';
import {GenericContainer, StartedTestContainer} from 'testcontainers';
import factory from 'rdf-ext';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const graphDb = new GenericContainer(
  'ontotext/graphdb:10.5.1'
).withExposedPorts(7200);
let startedGraphDb: StartedTestContainer;

const host = (container: StartedTestContainer) =>
  `http://localhost:${container.getMappedPort(7200)}`;

describe('GraphDBClient', () => {
  let client: GraphDBClient;

  beforeAll(async () => {
    startedGraphDb = await graphDb.start();

    const formData = new FormData();
    formData.append(
      'config',
      fs.createReadStream(
        path.join(__dirname, './fixtures/graphdb-repo-config.ttl')
      )
    );

    await axios.post(`${host(startedGraphDb)}/rest/repositories`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    client = new GraphDBClient({
      url: host(startedGraphDb),
      username: 'admin',
      password: 'root',
      repository: 'test-repo',
    });
  }, 60000);

  afterAll(async () => {
    await startedGraphDb.stop();
  });

  describe('store', () => {
    it('should store summary', async () => {
      const dataset = new Dataset('http://example.org/dataset', []);

      const summary = factory.dataset();
      summary.add(
        factory.quad(
          factory.namedNode('http://example.com/dataset'),
          factory.namedNode('http://example.com/predicate'),
          factory.namedNode('http://example.com/object'),
          factory.namedNode('http://example.com/dataset')
        )
      );

      await client.store(dataset, summary);

      const queryResult = await new QueryEngine().queryBindings(
        `select * where {
          graph <http://example.org/dataset> {
              ?s ?p ?o .
          }
      }`,
        {
          sources: [
            {
              type: 'sparql',
              value: `${host(startedGraphDb)}/repositories/test-repo`,
            },
          ],
        }
      );

      const bindings = await queryResult.toArray();

      expect(bindings.length).toBe(1);
      expect(bindings[0].get('s')?.value).toBe('http://example.com/dataset');
      expect(bindings[0].get('p')?.value).toBe('http://example.com/predicate');
      expect(bindings[0].get('o')?.value).toBe('http://example.com/object');
    });
  });
});
