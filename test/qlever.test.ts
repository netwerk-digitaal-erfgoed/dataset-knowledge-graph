import {Dataset, Distribution} from '../src/dataset.js';
import {QleverImporter} from '../src/qlever.js';
import {DockerTaskRunner} from '../src/task.js';
import ora from 'ora';
import {QueryEngine} from '@comunica/query-sparql-file';
import {ImportSuccessful} from '../src/importer.js';
import {
  startLocalDataDumpEndpoint,
  teardownDataDumpEndpoint,
} from './analyzer/localDataDumpEndpoint.js';
import path from 'node:path';
import {pino} from 'pino';
import {config} from '../src/config.js';

const queryEngine = new QueryEngine();
const dumpPort = 8083;

describe('QleverImporter', () => {
  beforeAll(
    async () => await startLocalDataDumpEndpoint(dumpPort, '../fixtures'),
  );

  afterAll(async () => await teardownDataDumpEndpoint());

  describe('import', () => {
    it('imports data dump', async () => {
      const importer = new QleverImporter({
        taskRunner: new DockerTaskRunner({
          image: config.QLEVER_IMAGE as string,
          containerName: 'dkg-qlever-test',
          mountDir: path.resolve('imports'),
          port: 7001,
        }),
      });
      const distribution = new Distribution();
      distribution.accessUrl = `http://localhost:${dumpPort}/dump.nt`;
      distribution.isValid = true;
      distribution.mimeType = 'application/n-triples';
      const dataset = new Dataset('https://example.com/dataset', [
        distribution,
      ]);

      const sparqlEndpoint = await importer.import(dataset, {
        progress: ora(),
        logger: pino(),
      });
      expect(sparqlEndpoint).toBeInstanceOf(ImportSuccessful);

      const bindingsStream = await queryEngine.queryBindings(
        'SELECT * WHERE { ?s ?p ?o }',
        {
          sources: [
            {
              type: 'sparql',
              value: (sparqlEndpoint as ImportSuccessful).endpoint,
            },
          ],
        },
      );
      const queryResult = await bindingsStream.toArray();
      expect(queryResult.length).toBe(1);
      expect(queryResult[0].get('o')?.value).toBe('Test');

      await importer.finish();
    }, 20_000);
  });
});
