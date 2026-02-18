import Docker, {type Container, type ContainerCreateOptions} from 'dockerode';
import process from 'node:process';
import {type ChildProcess, spawn} from 'node:child_process';
import {resolve} from 'node:path';
import type {TaskRunner} from '@lde/task-runner';

export type Task = Container | ChildProcess;

export function createTaskRunner(config: {
  QLEVER_ENV: string;
  QLEVER_IMAGE?: string;
  QLEVER_PORT?: number;
}): TaskRunner<Task> {
  if (config.QLEVER_ENV === 'docker' && config.QLEVER_IMAGE) {
    return new DockerTaskRunner({
      image: config.QLEVER_IMAGE,
      containerName: 'dkg-qlever',
      mountDir: resolve('imports'),
      port: config.QLEVER_PORT ?? 7001,
    });
  } else if (config.QLEVER_ENV === 'native') {
    return new NativeTaskRunner();
  } else {
    throw new Error(`Unknown task runner mode: ${config.QLEVER_ENV}`);
  }
}

interface DockerTaskRunnerOptions {
  image: string;
  containerName?: string;
  port?: number;
  mountDir?: string;
  docker?: Docker;
}

class DockerTaskRunner implements TaskRunner<Container> {
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
        `Task failed with status code ${result.StatusCode}: ${logs})`,
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
      } catch {
        // Ignore if the container does not exist yet.
      }
    }

    const pull = await this.options.docker.pull(this.options.image);
    const err = await new Promise<Error | null>(resolve =>
      this.options.docker.modem.followProgress(pull, resolve),
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
        Binds: [`${this.options.mountDir}:/mount`],
      };
      containerOptions.WorkingDir = '/mount';
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

class NativeTaskRunner implements TaskRunner<ChildProcess> {
  private stdout: Map<number, string> = new Map();
  private stderr: Map<number, string> = new Map();
  private shell = true;

  async run(command: string): Promise<ChildProcess> {
    const task = spawn(command, {
      detached: true,
      shell: this.shell,
      cwd: 'imports',
    });
    task.on('close', (code: number) => {
      /** code is null when the process was killed, which is expected when
       * {@link stop} is called. */
      if (code !== null && code !== 0) {
        throw new Error(this.taskOutput(task));
      }
    });
    task.on('error', (code: number) => {
      throw new Error(`Task errored with code ${code}`);
    });

    task.stdout.on('data', data => {
      this.stdout.set(
        task.pid!,
        this.stdout.get(task.pid!) ?? '' + data.toString(),
      );
    });

    task.stderr.on('data', data => {
      this.stderr.set(
        task.pid!,
        this.stderr.get(task.pid!) ?? '' + data.toString(),
      );
    });

    return task;
  }

  async wait(task: ChildProcess): Promise<string> {
    return new Promise((resolve, reject) => {
      task.removeAllListeners('close');
      task.on('close', (code: number) => {
        const output = this.taskOutput(task);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Process failed with code ${code}: ${output}`));
        }
      });
    });
  }

  async stop(task: ChildProcess): Promise<string | null> {
    if (task.exitCode !== null) {
      return this.taskOutput(task);
    }

    return new Promise(resolve => {
      const absoluteTimeout = setTimeout(() => {
        resolve(this.taskOutput(task));
      }, 10000);

      const killTimeout = setTimeout(() => {
        try {
          process.kill(-task.pid!, 'SIGKILL');
        } catch {
          // Process group may already be dead
        }
      }, 5000);

      task.once('close', () => {
        clearTimeout(killTimeout);
        clearTimeout(absoluteTimeout);
        resolve(this.taskOutput(task));
      });

      try {
        process.kill(-task.pid!, 'SIGTERM');
      } catch {
        clearTimeout(killTimeout);
        clearTimeout(absoluteTimeout);
        resolve(this.taskOutput(task));
      }
    });
  }

  private taskOutput(task: ChildProcess) {
    const output =
      (this.stdout.get(task.pid!) ?? '') + this.stderr.get(task.pid!);
    this.stdout.delete(task.pid!);
    this.stderr.delete(task.pid!);

    return output;
  }
}
