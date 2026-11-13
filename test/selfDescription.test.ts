import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Parser, type Quad} from 'n3';
import {
  publishSelfDescription,
  SELF_DESCRIPTION_GRAPH,
} from '../src/selfDescription.js';

const SCHEMA = 'https://schema.org/';
const DATASET_IRI =
  'https://data.netwerkdigitaalerfgoed.nl/dataset-knowledge-graph';
const SOURCE_FILE = resolve('description/dataset-knowledge-graph.ttl');

let outputDir: string;

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'self-description-'));
});

afterEach(async () => {
  await rm(outputDir, {recursive: true, force: true});
});

function publish(sourceFile = SOURCE_FILE): Promise<void> {
  return publishSelfDescription({
    sourceFile,
    outputDir,
    dateModified: new Date('2026-11-13T05:12:00.000Z'),
    version: '3.2.0',
  });
}

async function writeSource(turtle: string): Promise<string> {
  const sourceFile = join(outputDir, 'source.ttl');
  await writeFile(sourceFile, turtle);
  return sourceFile;
}

async function writtenQuads(): Promise<Quad[]> {
  const files = (await readdir(outputDir)).filter(file => file.endsWith('.nq'));
  expect(files).toHaveLength(1);
  const content = await readFile(join(outputDir, files[0]), 'utf8');
  return new Parser({format: 'N-Quads'}).parse(content);
}

function valuesOf(quads: Quad[], predicate: string): Quad[] {
  return quads.filter(
    quad =>
      quad.subject.value === DATASET_IRI &&
      quad.predicate.value === SCHEMA + predicate,
  );
}

describe('publishSelfDescription', () => {
  describe('with the Knowledge Graph’s description', () => {
    let quads: Quad[];

    beforeEach(async () => {
      await publish();
      quads = await writtenQuads();
    });

    it('adds the run’s end time as schema:dateModified', () => {
      const dateModified = valuesOf(quads, 'dateModified');
      expect(dateModified).toHaveLength(1);
      expect(dateModified[0].object).toMatchObject({
        value: '2026-11-13T05:12:00.000Z',
        datatype: {value: 'http://www.w3.org/2001/XMLSchema#dateTime'},
      });
    });

    it('adds the pipeline version as schema:version', () => {
      expect(valuesOf(quads, 'version').map(quad => quad.object.value)).toEqual(
        ['3.2.0'],
      );
    });

    it('writes every quad into the self-description graph', () => {
      expect(quads.length).toBeGreaterThan(20);
      expect(new Set(quads.map(quad => quad.graph.value))).toEqual(
        new Set([SELF_DESCRIPTION_GRAPH]),
      );
    });

    it('keeps the source description', () => {
      expect(
        valuesOf(quads, 'mainEntityOfPage').map(quad => quad.object.value),
      ).toEqual(['https://docs.nde.nl/services/dataset-knowledge-graph/']);
      expect(valuesOf(quads, 'license')).toHaveLength(1);
    });
  });

  it('accepts a dataset whose type is stated twice', async () => {
    await publish(
      await writeSource(
        `<${DATASET_IRI}> a <${SCHEMA}Dataset> .
         <${DATASET_IRI}> a <${SCHEMA}Dataset> ; <${SCHEMA}name> "Name"@en .`,
      ),
    );

    expect(valuesOf(await writtenQuads(), 'version')).toHaveLength(1);
  });

  it('rejects a source that sets a computed property itself', async () => {
    const sourceFile = await writeSource(
      `<${DATASET_IRI}> a <${SCHEMA}Dataset> ;
         <${SCHEMA}dateModified> "2020-01-01"^^<http://www.w3.org/2001/XMLSchema#date> .`,
    );

    await expect(publish(sourceFile)).rejects.toThrow(/dateModified/);
  });

  it('rejects a source without exactly one schema:Dataset', async () => {
    const sourceFile = await writeSource(
      `<https://example.org/org> a <${SCHEMA}Organization> .`,
    );

    await expect(publish(sourceFile)).rejects.toThrow(
      /exactly one schema:Dataset/,
    );
  });
});
