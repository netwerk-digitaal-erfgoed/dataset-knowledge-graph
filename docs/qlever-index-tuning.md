# QLever index tuning

Benchmark results for optimizing QLever index building, tuned for
[@lde/pipeline-void](https://www.npmjs.com/package/@lde/pipeline-void) queries.

## Dataset characteristics

- **Source:** [Open Archieven SRT](https://www.openarchieven.nl/id/dataset_srt)
  (`oa-export.s3.nl-ams.scw.cloud/nt/srt.nt.gz`)
- **Compressed size:** 3.6 GB (.nt.gz)
- **Triples:** 452,005,357
- **Distinct subjects:** 96,712,713
- **Distinct predicates:** 47
- **Vocabulary entries:** ~72.7M (unique IRIs, literals, and blank nodes across all positions)
- **Blank nodes:** 53,781,046
- **Average predicates per subject:** 4.4

## Query workload

The index is optimized for `@lde/pipeline-void` SPARQL queries (VoID statistics).
These queries:

- Use `?s ?p ?o` patterns with optional subject URI space filters
- Group/count by predicate, class, datatype, language
- Join on `?s a ?class` (rdf:type lookups)
- Never use predicate-only variables (no unbound `?p` without subject/object context)
- Don't use `ql:has-pattern`

This means PSO and POS permutations suffice; SPO/SOP/OSP/OPS and `ql:has-pattern`
precomputation can be disabled.

## Benchmark results

### Native macOS (Homebrew QLever 0.5.45)

| Batch | Perms | `-m` | Wall time | Peak memory |
|---|---|---|---|---|
| 1M | all 6 | 12G | 12m | ~5 GB |
| 3M | all 6 | 12G | 9m 37s | 11.1 GB |
| 4M | all 6 | 12G | 11m 30s | 11.8 GB |
| **3M** | **PSO+POS (`-o`)** | **10G** | **9m 23s** | **9.3 GB** |

### Docker Desktop for macOS (QLever commit-a14e0a0)

Using a named Docker volume (native Linux VM filesystem, avoiding VirtioFS overhead).
Docker adds ~2x overhead compared to native execution.

| Batch | Perms | `-m` | Wall time | Peak memory |
|---|---|---|---|---|
| 1M | PSO+POS (`-o`) | default (1G) | 40m | 7.9 GB |
| 1M | PSO+POS (`-o`) | 12G | 20m | 9.2 GB |
| 1M | all 6 | 8G | 46m | 7.9 GB |
| 1M | all 6 | 12G | 21m | 8.5 GB |

### Failed configurations

| Config | Batch | Failure | Peak memory |
|---|---|---|---|
| Any config, batch 5M+ (Docker) | 5M/10M | OOM killed during parsing | 13–15 GB |
| Batch 10M (native) | 10M | OOM killed during parsing | 10.5 GB |
| All perms, batch 100K | 100K | Merge fails: 'Insufficient memory for merging 145 blocks' | 5–8 GB |
| All perms, batch 1M, default stxxl | 1M | Merge fails: same error | 7.9 GB |
| `-o` with patterns | any | Error: patterns require all 6 permutations | — |

## Key findings

1. **`num-triples-per-batch` of 3M is the sweet spot** for this dataset on 16 GB machines.
   The default 100K creates too many partial vocabulary files (~4,500), making the merge
   step fail. Batch 5M+ causes OOM during parsing. Batch 4M is slower than 3M due to
   memory pressure.

2. **`-m` (stxxl memory) has a large impact on sort speed.** Increasing from the default
   1 GB to 10–12 GB halves total index time by reducing disk passes during the merge/sort
   phase.

3. **`-o` (PSO+POS only) is sufficient** for pipeline-void queries and saves memory during
   the sort phase without meaningfully increasing index time.

4. **`--no-patterns` saves memory and time** by skipping `ql:has-pattern` precomputation,
   which adds ~96M internal triples. The pipeline-void queries don't use this feature.
   Patterns also require all 6 permutations, so they're incompatible with `-o`.

5. **`-p true` (parallel parsing) should be set explicitly.** QLever enables it implicitly
   for backward compatibility but warns about deprecation.

6. **Native execution is ~2x faster than Docker** on macOS due to VM and filesystem
   overhead. On Linux, Docker overhead is negligible.

7. **Disk space:** the index build needs ~15–20 GB of temporary disk space for partial
   vocabulary files (~28 MB each, one per batch) and unsorted triples.

## Memory tuning knobs

QLever's index build has two sequential phases, each with its own memory control:

### Parsing phase: `num-triples-per-batch`

Set in `settings.json`. Controls how many triples are held in memory per batch. Larger
batches use more RAM during parsing but produce fewer partial vocabulary files (reducing
merge overhead later).

| Batch size | Parsing memory (observed) |
|---|---|
| 100K (default) | ~0.5 GB |
| 1M | ~5.5 GB |
| 3M | ~9–11 GB |
| 5M | ~13–15 GB (OOM on 16 GB) |

The per-triple memory cost varies with data characteristics (IRI lengths, literal sizes).

### Merge/sort phase: `-m` (stxxl memory)

CLI flag for `qlever-index`. Controls the memory budget for STXXL external sorting during
the merge phase. More memory means fewer disk passes and faster merging. The default is
**1 GB**.

**Important:** `-m` is **not** a cap on total process memory. It only controls the sort
buffer. QLever uses additional memory for vocabulary data structures, I/O buffers, and
other overhead. If the sort budget is too small for the number of blocks to merge, QLever
throws an error ('Insufficient memory for merging N blocks') rather than exceeding the
budget.

The two phases are **sequential**: parsing memory is freed before the merge phase
allocates its stxxl buffer. So peak memory is:

```
peak_memory ≈ max(parsing_memory, stxxl_memory + merge_overhead)
```

This means increasing `-m` up to the parsing memory level is essentially free — it
doesn't increase peak memory.

### Disk space

The index build needs ~15–20 GB of temporary disk space for partial vocabulary files
(~28 MB each, one per batch) and unsorted triples.

## Recommended configuration

```sh
qlever-index -i <name> -s settings.json -F nt -f - -p true -o --no-patterns -m 10G
```

With `settings.json`:

```json
{"ascii-prefixes-only": true, "num-triples-per-batch": 3000000}
```

This configuration indexes 452M triples in ~9.5 minutes natively with ~9.3 GB peak memory.
