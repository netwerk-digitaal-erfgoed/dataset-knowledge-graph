import Docker, {Container, ContainerCreateOptions} from 'dockerode';
import process from 'node:process';
import {ChildProcess, spawn} from 'node:child_process';

export type Task = Container | ChildProcess;

export interface TaskRunner<Task> {
  run(command: string): Promise<Task>;
  wait(task: Task): Promise<string>;
  stop(container: Task): Promise<string | null>;
}

export function createTaskRunner(
  mode: 'docker' | 'native',
  options?: DockerTaskRunnerOptions
): TaskRunner<Container | ChildProcess> {
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

export class NativeTaskRunner implements TaskRunner<ChildProcess> {
  private stdout: Map<number, string> = new Map();
  private stderr: Map<number, string> = new Map();
  private shell = true;

  async run(command: string): Promise<ChildProcess> {
    const task = spawn(command, {
      detached: true,
      shell: this.shell,
      cwd: 'imports', // TODO: don't hard-code
    });
    task.on('close', (code: number) => {
      console.error('close listener 1', code, task.pid);
      // Code is null on destroy, which is expected in stop();
      if (code !== null && code !== 0) {
        // throw new Error('nope ' + code);
        const output =
          (this.stdout.get(process.pid!) ?? '') + this.stderr.get(process.pid!);
        this.stdout.delete(process.pid!);
        this.stderr.delete(process.pid!);
        throw new Error(output);
      }
    });
    task.on('error', (code: number) => {
      console.error('error listener 1', code, task.pid);
    });
    task.on('exit', (code: number) => {
      console.error('exit listener 1', code, task.pid);
    });
    task.stdout.on('data', data => {
      // console.log('out', data.toString());
      this.stdout.set(
        process.pid!,
        this.stdout.get(process.pid!) ?? '' + data.toString()
      );
    });

    task.stderr.on('data', data => {
      // console.log('err', data.toString());
      throw new Error(data.toString());
      // this.stderr.set(
      //   process.pid!,
      //   this.stderr.get(process.pid!) ?? '' + data.toString()
      // );
    });

    // process.unref();
    console.log('returning process', task.pid);
    // task.unref();
    return task;
  }

  async wait(task: ChildProcess): Promise<string> {
    console.log('waiting for id ', task.pid!);
    return new Promise((resolve, reject) => {
      task.on('error', () => {
        console.log('error listener 2', task.pid);
        reject(new Error('error'));
      });
      task.on('close', (code: number) => {
        console.log('close listener 2', code, task.pid);
        const output =
          (this.stdout.get(task.pid!) ?? '') + this.stderr.get(task.pid!);
        if (code === 0) {
          console.log('resolving');
          // this.stdout.delete(task.pid!);
          // this.stderr.delete(task.pid!);
          resolve('done');
        } else {
          // this.stdout.delete(task.pid!);
          // this.stderr.delete(task.pid!);
          reject(new Error(`Process failed with code ${code}: ${output}`));
        }
      });
    });
  }

  async stop(task: ChildProcess): Promise<string | null> {
    console.log('killing', task.pid);
    return new Promise(resolve => {
      task.on('close', () => {
        console.log('close through kill');
        resolve('logs');
      });
      console.log('killing process', task.pid);

      try {
        process.kill(-task.pid!, 'SIGTERM'); // negative to kill whole process group: the {shell: true} splits off a sepraate process.
      } catch (e) {
        console.log('error killing process', e);
        resolve('logs');
      }
    });
  }
}
