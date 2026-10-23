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
RDF data dumps. It can run in **Docker** mode (default), **native** mode, or
**remote** mode.

Set the mode via the `QLEVER_ENV` environment variable in `.env`:

```sh
# Docker mode (default): requires Docker and a QLever image.
QLEVER_ENV=docker
QLEVER_IMAGE=adfreiburg/qlever:commit-a14e0a0

# Native mode: requires qlever-index and qlever-server on PATH.
# On macOS: brew install qlever-dev/qlever/qlever
QLEVER_ENV=native

# Remote mode (production only): QLever runs in a sidecar of the pod, controlled
# through the task agent of @lde/task-runner-http. Without that sidecar, imports
# wait six minutes for an agent and then fail, so do not use it locally.
QLEVER_ENV=remote
```

Native mode is ~2x faster than Docker on macOS (see [index tuning benchmarks](docs/qlever-index-tuning.md)).

Production runs in remote mode, so QLever has a memory limit of its own: a dump
that runs QLever out of memory restarts only the sidecar and fails that one
dataset, instead of the whole run. The image therefore contains no QLever; the
sidecar runs the upstream QLever image with `/app/imports` mounted at the same
path as in the pipeline container. See [@lde/task-runner-http](https://ldelements.org/reference/task-runner-http#kubernetes)
for the pod setup. The QLever version production runs is the sidecar image in the
[infrastructure](https://github.com/netwerk-digitaal-erfgoed/infrastructure) repository’s
`k8s/dataset-knowledge-graph/helmrelease.yaml`; `QLEVER_IMAGE` in `.env` only applies to
local Docker-mode runs.

The embedded QLever server can be tuned via these environment variables (defaults shown):

| Variable | Default | Description |
| --- | --- | --- |
| `QLEVER_MEMORY_MAX_SIZE` | `12G` | Maximum memory QLever uses for query processing and caching (the result cache is part of this budget). Keep it below QLever’s container memory limit (the sidecar’s 22 GiB in production): a query that would exceed it is aborted with an HTTP 500 that the pipeline catches per stage and continues, instead of the container being OOM-killed. |
| `QLEVER_QUERY_TIMEOUT` | `310s` | QLever’s per-query timeout. Keep it just above `SPARQL_REQUEST_TIMEOUT_MS`: below it, QLever cuts off queries the pipeline is still waiting for; far above it, a query the pipeline gave up on keeps running and takes memory from the next stages, since QLever doesn’t stop a query when its client disconnects. |
| `SPARQL_REQUEST_TIMEOUT_MS` | `300000` | Per-request timeout (milliseconds) for SPARQL queries against endpoints, including the local QLever server. Applied as the `adaptiveTimeoutPolicy` default budget in `main.ts`; this is the effective upper bound on a single query. Covers SPARQL query requests only — not data-dump downloads or imports, which are timed out separately by the downloader. |
