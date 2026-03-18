import {Dataset} from '@lde/dataset';
import {Client, Paginator} from '@lde/dataset-registry-client';
import {RegistrySelector, type DatasetSelector} from '@lde/pipeline';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {rdfDereferencer} from 'rdf-dereference';

const SUBJECT_FILTER_PREDICATE =
  'https://data.netwerkdigitaalerfgoed.nl/def/subjectFilter';

async function loadSubjectFilters(): Promise<Map<string, string>> {
  const {data} = await rdfDereferencer.dereference(
    resolve('queries/selection/supplemental.ttl'),
    {localFiles: true},
  );

  const filters = new Map<string, string>();
  for await (const quad of data) {
    if (quad.predicate.value === SUBJECT_FILTER_PREDICATE) {
      filters.set(quad.subject.value, quad.object.value + '.');
    }
  }
  return filters;
}

/**
 * Generate a subject filter for data.bibliotheken.nl datasets dynamically,
 * so new datasets are picked up without manual supplemental.ttl entries.
 */
function bibliotheeknlSubjectFilter(datasetIri: string): string | undefined {
  if (!datasetIri.startsWith('http://data.bibliotheken.nl/id/dataset/')) {
    return undefined;
  }
  return `?s <http://schema.org/mainEntityOfPage>/<http://schema.org/isPartOf> <${datasetIri}>.`;
}

export async function createSubjectFilterSelector(): Promise<DatasetSelector> {
  const filters = await loadSubjectFilters();
  const query = (
    await readFile(
      resolve('queries/selection/dataset-with-rdf-distribution.rq'),
    )
  ).toString();

  const inner = new RegistrySelector({
    registry: new Client(
      new URL('https://datasetregister.netwerkdigitaalerfgoed.nl/sparql'),
    ),
    query,
  });

  return {
    async select() {
      const paginator = await inner.select();
      const datasets: Dataset[] = [];

      for await (const dataset of paginator) {
        const datasetIri = dataset.iri.toString();
        const filter =
          filters.get(datasetIri) ?? bibliotheeknlSubjectFilter(datasetIri);
        if (filter) {
          for (const distribution of dataset.distributions) {
            distribution.subjectFilter = filter;
          }
        }
        datasets.push(dataset);
      }

      return new Paginator(async () => datasets, datasets.length);
    },
  };
}
