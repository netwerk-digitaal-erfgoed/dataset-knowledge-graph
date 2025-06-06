import Docker, {Container, ContainerCreateOptions} from 'dockerode';
import process from 'node:process';
import {spawnd, SpawndChildProcess} from 'spawnd';

export type Task = Container | SpawndChildProcess;

export interface TaskRunner<Task> {
  run(command: string): Promise<Task>;
  wait(task: Task): Promise<string>;
  stop(container: Task): Promise<string | null>;
}

export function createTaskRunner(
  mode: 'docker' | 'native',
  options?: DockerTaskRunnerOptions
): TaskRunner<Container | SpawndChildProcess> {
  if (mode === 'docker' && undefined !== options) {
    return new DockerTaskRunner(options);
  } else if (mode === 'native') {
    return new NativeTaskRunner();
  } else {
    throw new Error(`Unknown task runner mode: ${mode}`);
  }
}

export interface DockerTaskRunnerOptions {
  image: string;
  containerName?: string;
  port?: number;
  mountDir?: string;
  docker?: Docker;
}

export class DockerTaskRunner implements TaskRunner<Container> {
  private readonly options;

  constructor(options: DockerTaskRunnerOptions) {
    this.options = {
      docker: new Docker(),
      ...options,
    };
  }

  async wait(task: Container): Promise<string> {
    const result = await task.wait();
    const logs = (
      await task.logs({
        stdout: true,
        stderr: true,
        follow: false,
      })
    ).toString();

    if (result.StatusCode !== 0) {
      throw new Error(
        `Task failed with status code ${result.StatusCode}: ${logs})`
      );
    }

    return logs;
  }

  async run(command: string): Promise<Container> {
    if (this.options.containerName) {
      try {
        await this.options.docker
          .getContainer(this.options.containerName)
          .remove({force: true});
      } catch (e) {
        // Ignore if the container does not exist yet.
      }
    }

    const pull = await this.options.docker.pull(this.options.image);
    const err = await new Promise<Error | null>(resolve =>
      this.options.docker.modem.followProgress(pull, resolve)
    );
    if (err) {
      throw err;
    }

    const containerOptions: ContainerCreateOptions = {
      Entrypoint: ['sh', '-c'],
      Image: this.options.image,
      Cmd: [command],
      name: this.options.containerName,
      User: `${process.getuid!()}:${process.getgid!()}`,
    };

    if (this.options.port) {
      containerOptions.ExposedPorts = {
        [`${this.options.port}/tcp`]: {},
      };
      containerOptions.HostConfig = {
        PortBindings: {
          [`${this.options.port}/tcp`]: [
            {
              HostPort: this.options.port.toString(),
            },
          ],
        },
      };
    }

    if (this.options.mountDir) {
      containerOptions.HostConfig = {
        ...containerOptions.HostConfig,
        Binds: [`${this.options.mountDir}:/data`],
      };
      containerOptions.WorkingDir = '/data';
    }

    const container =
      await this.options.docker.createContainer(containerOptions);

    await container.start();

    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 100,
    });

    logStream.on('data', () => {
      // process.stdout.write(chunk.toString());
    });

    return container;
  }

  async stop(task: Container): Promise<string> {
    const logs = await task.logs({
      stdout: true,
      stderr: true,
      follow: false,
    });
    await task.remove({force: true});
    return logs.toString();
  }
}

export class NativeTaskRunner implements TaskRunner<SpawndChildProcess> {
  private stdout: Map<number, string> = new Map();
  private stderr: Map<number, string> = new Map();

  async run(command: string): Promise<SpawndChildProcess> {
    const process = spawnd(command, {detached: true, stdio: 'pipe'});
    process.stdout.on('data', data => {
      this.stdout.set(
        process.pid!,
        this.stdout.get(process.pid!) ?? '' + data.toString()
      );
    });

    process.stderr.on('data', data => {
      this.stderr.set(
        process.pid!,
        this.stderr.get(process.pid!) ?? '' + data.toString()
      );
    });

    return process;
  }

  async wait(task: SpawndChildProcess): Promise<string> {
    return new Promise((resolve, reject) => {
      task.on('close', (code: number) => {
        const output =
          this.stdout.get(task.pid!) ?? '' + this.stderr.get(task.pid!);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Process failed with code ${code}: ${output}`));
        }
      });
    });
  }

  async stop(task: SpawndChildProcess): Promise<string | null> {
    const output =
      this.stdout.get(task.pid!) ?? '' + this.stderr.get(task.pid!);
    task.kill();
    this.stdout.delete(task.pid!);
    this.stderr.delete(task.pid!);
    return output;
  }
}
