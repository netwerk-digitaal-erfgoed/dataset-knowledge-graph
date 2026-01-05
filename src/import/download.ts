import {Distribution} from '../dataset.js';
import filenamify from 'filenamify-url';
import {join, resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {createWriteStream} from 'node:fs';
import {access, stat} from 'node:fs/promises';
import {Context} from '../pipeline.js';

export class Downloader {
  constructor(private readonly path: string = 'imports') {}

  public async download(
    distribution: Distribution,
    context: Context,
  ): Promise<string> {
    const downloadUrl = distribution.accessUrl!;
    const filename = filenamify(downloadUrl.toString());
    const filePath = resolve(join(this.path, filename));

    if (await this.localFileIsUpToDate(filePath, distribution)) {
      context.logger.debug(
        `File ${filePath} is up to date, skipping download.`,
      );
      return filePath;
    }

    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok || !downloadResponse.body) {
      throw new Error(
        `Failed to download ${downloadUrl}: ${downloadResponse.statusText}`,
      );
    }

    try {
      await pipeline(downloadResponse.body, createWriteStream(filePath));
    } catch (error) {
      throw new Error(`Failed to save ${downloadUrl} to ${filePath}: ${error}`);
    }

    const stats = await stat(filePath);
    if (stats.size <= 1) {
      context.logger.debug(`Data dump ${downloadUrl} is empty`);
      throw new Error('data dump is empty');
    }

    return filePath;
  }

  private async localFileIsUpToDate(
    filePath: string,
    distribution: Distribution,
  ): Promise<boolean> {
    if (undefined === distribution.lastModified) {
      return false;
    }

    try {
      await access(filePath);
    } catch {
      return false;
    }
    const stats = await stat(filePath);

    // Check if file size matches expected size to detect incomplete downloads.
    if (
      distribution.byteSize !== undefined &&
      stats.size !== distribution.byteSize
    ) {
      return false;
    }

    return stats.mtime >= distribution.lastModified;
  }
}
