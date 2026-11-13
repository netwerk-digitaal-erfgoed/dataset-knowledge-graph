import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Parser, type Quad} from 'n3';
import {
  publishSelfDescription,
  SELF_DESCRIPTION_GRAPH,
} from '../src/selfDescription.js';

const DCAT = 'http://www.w3.org/ns/dcat#';
const DCT = 'http://purl.org/dc/terms/';
const DATASET_IRI =
  'https://data.netwerkdigitaalerfgoed.nl/dataset-knowledge-graph';
const SOURCE_FILE = resolve('dataset-description.ttl');

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
      quad.subject.value === DATASET_IRI && quad.predicate.value === predicate,
  );
}

describe('publishSelfDescription', () => {
  describe('with the Knowledge Graph’s description', () => {
    let quads: Quad[];

    beforeEach(async () => {
      await publish();
      quads = await writtenQuads();
    });

    it('adds the run’s end time as dct:modified', () => {
      const dateModified = valuesOf(quads, DCT + 'modified');
      expect(dateModified).toHaveLength(1);
      expect(dateModified[0].object).toMatchObject({
        value: '2026-11-13T05:12:00.000Z',
        datatype: {value: 'http://www.w3.org/2001/XMLSchema#dateTime'},
      });
    });

    it('adds the pipeline version as dcat:version', () => {
      expect(
        valuesOf(quads, DCAT + 'version').map(quad => quad.object.value),
      ).toEqual(['3.2.0']);
    });

    it('writes every quad into the self-description graph', () => {
      expect(quads.length).toBeGreaterThan(20);
      expect(new Set(quads.map(quad => quad.graph.value))).toEqual(
        new Set([SELF_DESCRIPTION_GRAPH]),
      );
    });

    it('keeps the source description', () => {
      expect(
        valuesOf(quads, DCAT + 'landingPage').map(quad => quad.object.value),
      ).toEqual(['https://docs.nde.nl/services/dataset-knowledge-graph/']);
      expect(valuesOf(quads, DCT + 'source')).toHaveLength(1);
    });
  });

  it('accepts a dataset whose type is stated twice', async () => {
    await publish(
      await writeSource(
        `<${DATASET_IRI}> a <${DCAT}Dataset> .
         <${DATASET_IRI}> a <${DCAT}Dataset> ; <${DCT}title> "Name"@en .`,
      ),
    );

    expect(valuesOf(await writtenQuads(), DCAT + 'version')).toHaveLength(1);
  });

  it('rejects a source that sets a computed property itself', async () => {
    const sourceFile = await writeSource(
      `<${DATASET_IRI}> a <${DCAT}Dataset> ;
         <${DCT}modified> "2020-01-01"^^<http://www.w3.org/2001/XMLSchema#date> .`,
    );

    await expect(publish(sourceFile)).rejects.toThrow(/modified/);
  });

  it('rejects a source without exactly one schema:Dataset', async () => {
    const sourceFile = await writeSource(
      `<https://example.org/org> a <http://xmlns.com/foaf/0.1/Organization> .`,
    );

    await expect(publish(sourceFile)).rejects.toThrow(
      /exactly one dcat:Dataset/,
    );
  });
});
