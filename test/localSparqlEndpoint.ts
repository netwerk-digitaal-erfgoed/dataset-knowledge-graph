import {setup, teardown as teardownServer} from 'jest-dev-server';
import {SpawndChildProcess} from 'spawnd';
import {dirname} from 'path';
import {fileURLToPath} from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const teardownSparqlEndpoint = async () => {
  await teardownServer(servers);
};

let servers: SpawndChildProcess[];
export async function startLocalSparqlEndpoint(
  port: number,
  fixture: string
): Promise<void> {
  servers = await setup({
    command: `npx comunica-sparql-file-http ${__dirname}/${fixture} -p ${port}`,
    port,
    launchTimeout: 60000,
  });
}
