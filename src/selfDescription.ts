import {readFile} from 'node:fs/promises';
import {DataFactory, Parser} from 'n3';
import type {Quad} from '@rdfjs/types';
import {Dataset} from '@lde/dataset';
import {FileWriter} from '@lde/pipeline';
import {rdf, xsd} from '@tpluscode/rdf-ns-builders';
import {schema} from './namespaces.js';
import {writeRun} from './writeRun.js';

const {literal, quad} = DataFactory;

/**
 * The graph that holds the Knowledge Graph’s own dataset description. The
 * registration URL redirects to a fixed `CONSTRUCT … WHERE { GRAPH <…> {…} }`
 * over it, so the description can change without the registration URL changing.
 *
 * Deliberately not the dataset IRI: summaries live in a graph named after their
 * dataset IRI, and the Knowledge Graph summarises itself once it is registered,
 * which would mix its summary into its description.
 */
export const SELF_DESCRIPTION_GRAPH =
  'https://data.netwerkdigitaalerfgoed.nl/dataset-knowledge-graph/description';

/** Properties computed per run, so the source file must not set them. */
const COMPUTED_PROPERTIES = [schema.dateModified, schema.version];

export interface PublishSelfDescriptionOptions {
  /** Turtle source of the description, with exactly one `schema:Dataset`. */
  sourceFile: string;
  /** Directory the n-quads file goes to, under the served index’s input. */
  outputDir: string;
  /** When the Knowledge Graph last changed: the end of this run. */
  dateModified: Date;
  /** The pipeline version that produced the summaries. */
  version: string;
}

/**
 * Publish the Knowledge Graph’s dataset description into
 * {@link SELF_DESCRIPTION_GRAPH}: the hand-written source plus
 * `schema:dateModified` and `schema:version`, which only a run knows.
 */
export async function publishSelfDescription(
  options: PublishSelfDescriptionOptions,
): Promise<void> {
  const quads = new Parser({format: 'Turtle'}).parse(
    await readFile(options.sourceFile, 'utf8'),
  );
  const dataset = describedDataset(quads, options.sourceFile);

  quads.push(
    quad(
      dataset,
      schema.dateModified,
      literal(options.dateModified.toISOString(), xsd.dateTime),
    ),
    quad(dataset, schema.version, literal(options.version)),
  );

  await writeRun(
    new FileWriter({
      outputDir: options.outputDir,
      format: 'n-quads',
      graphIri: () => new URL(SELF_DESCRIPTION_GRAPH),
    }),
    [
      {
        dataset: new Dataset({iri: new URL(dataset.value), distributions: []}),
        quads,
      },
    ],
  );
}

function describedDataset(quads: readonly Quad[], sourceFile: string) {
  // Keyed on the IRI, so a repeated `a schema:Dataset` counts once.
  const datasets = new Map(
    quads
      .filter(
        candidate =>
          candidate.predicate.equals(rdf.type) &&
          candidate.object.equals(schema.Dataset),
      )
      .map(candidate => [candidate.subject.value, candidate.subject]),
  );
  const [dataset] = datasets.values();
  if (datasets.size !== 1 || dataset.termType !== 'NamedNode') {
    throw new Error(
      `${sourceFile} must describe exactly one schema:Dataset with an IRI`,
    );
  }

  for (const property of COMPUTED_PROPERTIES) {
    const isSet = quads.some(
      candidate =>
        candidate.subject.equals(dataset) &&
        candidate.predicate.equals(property),
    );
    if (isSet) {
      throw new Error(
        `${sourceFile} sets ${property.value}, which each run computes; remove it`,
      );
    }
  }

  return dataset;
}
