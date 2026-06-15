# NDE Dataset Knowledge Graph Pipeline

The NDE Dataset Knowledge Graph helps researchers, software developers and others to **find relevant datasets** for
their projects. It enriches the [Dataset Register](https://github.com/netwerk-digitaal-erfgoed/dataset-register) with
empirical, [VoID](https://www.w3.org/TR/void/)-modelled summaries of each dataset’s content.

This repository is the data pipeline that generates the Knowledge Graph.

📖 **What the Knowledge Graph contains, how to query it, and the output data model are documented at
[docs.nde.nl/services/dataset-knowledge-graph](https://docs.nde.nl/services/dataset-knowledge-graph/).**
This README covers running the pipeline locally.

## Run the pipeline

To run the pipeline yourself, start by cloning this repository. Then execute:

    npm install
    npm run dev

The Dataset Summaries output will be written to the `output/` directory.

### QLever

The pipeline uses [QLever](https://github.com/ad-freiburg/qlever) to index and query
RDF data dumps. It can run in **Docker** mode (default) or **native** mode.

Set the mode via the `QLEVER_ENV` environment variable in `.env`:

```sh
# Docker mode (default): requires Docker and a QLever image.
QLEVER_ENV=docker
QLEVER_IMAGE=adfreiburg/qlever:commit-a14e0a0

# Native mode: requires qlever-index and qlever-server on PATH.
# On macOS: brew install qlever-dev/qlever/qlever
QLEVER_ENV=native
```

Native mode is ~2x faster than Docker on macOS (see [index tuning benchmarks](docs/qlever-index-tuning.md)).

The embedded QLever server can be tuned via these environment variables (defaults shown):

| Variable | Default | Description |
| --- | --- | --- |
| `QLEVER_MEMORY_MAX_SIZE` | `12G` | Maximum memory QLever uses for query processing and caching (the result cache is part of this budget). Keep it below the container memory limit (16 GiB in production): a query that would exceed it is aborted with an HTTP 500 that the pipeline catches per stage and continues, instead of the container being OOM-killed. |
| `QLEVER_QUERY_TIMEOUT` | `600s` | QLever’s per-query timeout. Keep it above `SPARQL_REQUEST_TIMEOUT_MS` so QLever only acts as a backstop. Raised from 120s, which cut off the ~2-minute analysis queries on large datasets. |
| `SPARQL_REQUEST_TIMEOUT_MS` | `300000` | Per-request timeout (milliseconds) for SPARQL queries against endpoints, including the local QLever server. Applied as the `adaptiveTimeoutPolicy` default budget in `main.ts`; this is the effective upper bound on a single query. Covers SPARQL query requests only — not data-dump downloads or imports, which are timed out separately by the downloader. |
