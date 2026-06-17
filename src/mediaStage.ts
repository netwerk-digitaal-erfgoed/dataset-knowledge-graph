import {resolve} from 'node:path';
import {DataFactory} from 'n3';
import {_void, xsd} from '@tpluscode/rdf-ns-builders';
import type {Quad} from '@rdfjs/types';
import type {Dataset, Distribution} from '@lde/dataset';
import {
  Stage,
  SparqlConstructExecutor,
  readQueryFile,
  NotSupported,
  type Executor,
  type ExecuteOptions,
} from '@lde/pipeline';
import {probe} from './namespaces.js';

const {literal, quad} = DataFactory;

const QUERY_FILE = resolve('queries/analysis/media.rq');

/**
 * Detect whether a dataset exposes any media and emit a `void:subset` marked
 * `<https://def.nde.nl/probe#detects> <https://def.nde.nl/probe#media>`, with a
 * self-describing `void:propertyPartition` per media predicate found. The
 * subset’s own `void:entities` is the MAX over those partitions — a
 * double-count-safe lower bound on the number of media objects, since the same
 * record commonly carries several media predicates (`image` + `thumbnailUrl` +
 * `contentUrl`) and summing would triple-count it.
 *
 * The subset exists iff the dataset has media, so its mere presence is the
 * `has-media` signal: a media-bearing dataset that offers no IIIF is then
 * observable as “media, but no IIIF” rather than indistinguishable from “no
 * media”. IIIF manifests are themselves media, so {@link iiifStage} nests its
 * capability subset under this one (`iiif ⊆ media`).
 */
export function mediaStage(): Promise<Stage> {
  return readQueryFile(QUERY_FILE).then(query => {
    // `deduplicate` collapses the constant subset/marker triples, which the
    // GROUP BY repeats once per media-predicate partition row.
    const detection = new SparqlConstructExecutor({query, deduplicate: true});
    return new Stage({
      name: 'media.rq',
      executors: new MediaSubsetExecutor(detection),
    });
  });
}

/**
 * Executor decorator that adds the aggregate `void:entities` to the media
 * subset. The detection query emits one `void:propertyPartition` per media
 * predicate with its own count; this passes those through unchanged and, once
 * the stream is exhausted, appends `void:entities` on the subset set to the MAX
 * of the partition counts (a lower bound on the media-object count).
 */
export class MediaSubsetExecutor implements Executor {
  constructor(private readonly inner: Executor) {}

  async execute(
    dataset: Dataset,
    distribution: Distribution,
    options?: ExecuteOptions,
  ): Promise<AsyncIterable<Quad> | NotSupported> {
    const result = await this.inner.execute(dataset, distribution, options);
    if (result instanceof NotSupported) {
      return result;
    }
    return this.withAggregate(result);
  }

  private async *withAggregate(
    quads: AsyncIterable<Quad>,
  ): AsyncIterable<Quad> {
    let mediaSubset: Quad['subject'] | undefined;
    let maxEntities = 0;
    for await (const q of quads) {
      // The media subset is the subject carrying the probe marker.
      if (q.predicate.equals(probe.detects) && q.object.equals(probe.media)) {
        mediaSubset = q.subject;
      }
      // Every void:entities in this stage is a media partition count.
      if (q.predicate.equals(_void.entities)) {
        maxEntities = Math.max(maxEntities, Number(q.object.value));
      }
      yield q;
    }

    // No media subset: the dataset has no media (state 0); emit nothing extra.
    if (mediaSubset === undefined) {
      return;
    }

    yield quad(
      mediaSubset,
      _void.entities,
      literal(String(maxEntities), xsd.integer),
    );
  }
}
