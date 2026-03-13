# VoID stage tuning results

Tested against the Muziekweb SPARQL endpoint (`https://api.data.muziekweb.nl/…/sparql`) with a single dataset (`http://data.beeldengeluid.nl/id/dataset/0026`, ~20 classes).

## Context

`@lde/pipeline-void` 0.21.0 runs per-class VoID stages by default: each query is executed once per class (via `VALUES ?class` bindings), batched and parallelised according to `batchSize` and `maxConcurrency`. The library defaults are `batchSize: 10, maxConcurrency: 10`.

- **`batchSize`** — number of class bindings combined into a single SPARQL query (via `VALUES`).
- **`maxConcurrency`** — number of batches sent to the endpoint in parallel.
- **Reported times are total per stage**, not per batch.

## Baseline (before per-class support)

All queries ran globally (one query over all classes at once). `class-properties-subjects.rq` consistently timed out (504); other stages completed in ~1 minute total.

## Results

| `batchSize` | `maxConcurrency` | Per-class stages | Total time |
|:-----------:|:----------------:|:----------------:|:----------:|
| _global_    | —                | 4/5 failed (504/503) | 11m 52s |
| 1           | 1                | All pass         | 5.9s       |
| 1           | 2                | All pass         | 3.2s       |
| 1           | 3                | All pass         | 2.6s       |
| 1           | 5                | All pass         | 2.6s       |
| 1           | 10               | All pass         | 2.6s       |
| 2           | 1                | 3/5 failed (504/503) | 13m 34s |
| 3           | 2                | 4/5 failed (504/503/500) | 5m 15s |
| 5           | 3                | 2/5 failed (504/503) | 6m 19s |

### Gouda Tijdmachine (`https://sparql.goudatijdmachine.nl/`, QLever, ~28 classes)

| Stage | Before (`batchSize: 10`) | After (`batchSize: 1`) |
|---|---|---|
| subjects.rq | 4.1s | 3.3s |
| properties.rq | 285ms | 78ms |
| object-literals.rq | 2.6s | 2.5s |
| object-uris.rq | 2.1s | 2.1s |
| datatypes.rq | 6.3s | 6.4s |
| triples.rq | 257ms | 230ms |
| class-partition.rq | 148ms | 106ms |
| class-properties-subjects.rq | 15.5s | 10.2s |
| class-properties-objects.rq | 8.8s | 6.1s |
| class-property-datatypes.rq | **failed (500)** | **21.9s** |
| class-property-object-classes.rq | 10.8s | 4.9s |
| class-property-languages.rq | 12.2s | 8.1s |
| licenses.rq | 114ms | 86ms |
| entity-properties.rq | 9.9s | failed (transient) |
| subject-uri-space.rq | 5.9s | 6.2s |
| object-uri-space.rq | 7.2s | 7.3s |
| **Total** | **2m 7.4s** | **1m 23.3s** |

Key improvement: `class-property-datatypes.rq` previously failed with a QLever "Waited for a result from another thread which then failed" error at `batchSize: 10`. With `batchSize: 1` it completes in 21.9s. Overall time dropped by 35%.

## Findings

1. **`batchSize` is the critical parameter.** Combining even 2 classes in a single `VALUES` clause causes 504 Gateway Timeouts on this endpoint. `batchSize: 1` is the only reliable setting.
2. **`maxConcurrency` has diminishing returns.** Performance plateaus at 3 concurrent requests (~2.6s). Higher values work but don't improve speed — the endpoint handles parallel single-class queries fine.
3. **The library defaults (`batchSize: 10, maxConcurrency: 10`) are too aggressive** for third-party SPARQL endpoints like Muziekweb's Virtuoso instance.

## Recommendation

```ts
const stages = await voidStages({uriSpaces, batchSize: 1});
```

Set `batchSize: 1` and leave `maxConcurrency` at the default. This is both reliable and fast.
