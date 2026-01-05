import {Distribution} from '../../src/dataset.js';
import {Downloader} from '../../src/import/download.js';
import nock from 'nock';
import {join} from 'node:path';
import {unlinkSync, readFileSync} from 'node:fs';
import os from 'node:os';
import fs from 'node:fs/promises';
import ora from 'ora';
import {pino} from 'pino';

const localFile = join(os.tmpdir(), 'example.com!file.nt');
const downloader = new Downloader(os.tmpdir());
const distribution = new Distribution();
distribution.accessUrl = 'https://example.com/file.nt';

const context = {
  progress: ora(),
  logger: pino(),
};

describe('Downloader', () => {
  afterAll(async () => {
    nock.restore();
  });

  describe('download', () => {
    beforeEach(() => {
      try {
        unlinkSync(localFile);
      } catch (e) {
        // Ignore if not exists.
      }
    });

    it('downloads file', async () => {
      nock('https://example.com').get('/file.nt').reply(200, 'mock file');

      const filePath = await downloader.download(distribution, context);
      expect(filePath).toBe(localFile);

      const fileContent = readFileSync(localFile, 'utf8');
      expect(fileContent).toBe('mock file');
    });

    it('does not download file again if it is up to date', async () => {
      nock('https://example.com')
        .get('/file.nt')
        .times(1)
        .reply(200, 'mock file');
      const filePath = await downloader.download(distribution, context);
      const stat = await fs.stat(filePath);

      distribution.lastModified = new Date('2001-01-01');
      await downloader.download(distribution, context);
      expect((await fs.stat(filePath)).mtime).toEqual(stat.mtime);
    });

    it('throws an error if file is unavailable', async () => {
      nock('https://example.com').get('/file.nt').reply(500);
      await expect(downloader.download(distribution, context)).rejects.toThrow(
        'Failed to download https://example.com/file.nt: Internal Server Error',
      );
    });

    it('throws an error if file is empty', async () => {
      nock('https://example.com').get('/file.nt').reply(200, '');
      await expect(downloader.download(distribution, context)).rejects.toThrow(
        'data dump is empty',
      );
    });

    it('re-downloads file if local file size does not match byteSize', async () => {
      // First download creates incomplete file.
      nock('https://example.com').get('/file.nt').reply(200, 'partial');
      await downloader.download(distribution, context);

      // Set distribution metadata indicating file should be larger.
      distribution.lastModified = new Date('2001-01-01');
      distribution.byteSize = 100;

      // Second download should re-fetch because size doesn't match.
      nock('https://example.com').get('/file.nt').reply(200, 'complete file');
      await downloader.download(distribution, context);

      const fileContent = readFileSync(localFile, 'utf8');
      expect(fileContent).toBe('complete file');
    });
  });
});
