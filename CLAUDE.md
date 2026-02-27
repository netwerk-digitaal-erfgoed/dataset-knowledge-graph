# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build and Development
- `npm install` - Install dependencies (requires Node.js >=22)
- `npm run dev` - Run in development mode with TypeScript watch and auto-restart
- `npm run compile` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled pipeline

### Code Quality
- `npm run lint` - Run ESLint (using Google TypeScript Style)
- `npm run fix` - Auto-fix linting issues
- `npm run clean` - Clean build artifacts

## Architecture Overview

The NDE Dataset Knowledge Graph Pipeline analyzes RDF datasets to generate statistical summaries using the VoID vocabulary. Most pipeline logic lives in published `@lde/*` packages; this repository wires them together with project-specific configuration.

### Pipeline Flow (see `src/main.ts`)
1. **Selection** (`src/subjectFilters.ts`) - Queries the Dataset Register for datasets with RDF distributions, enriches them with subject filters from `queries/selection/supplemental.ttl`
2. **Distribution resolution** - `@lde/pipeline` resolves and imports distributions via `@lde/sparql-qlever` (QLever)
3. **Analysis stages** - VoID analysis stages from `@lde/pipeline-void` (class partitions, property counts, URI spaces, licenses, vocabularies, etc.)
4. **Writers** - Output results to local Turtle files (`output/`) and optionally to a SPARQL UPDATE endpoint (e.g. GraphDB)

### Key Dependencies
- **`@lde/pipeline`** - Core pipeline framework (stages, writers, reporters)
- **`@lde/pipeline-void`** - VoID analysis stages (class partitions, properties, URI spaces, etc.)
- **`@lde/sparql-qlever`** - QLever SPARQL server adapter for importing and querying RDF dumps
- **`@lde/dataset`** / **`@lde/dataset-registry-client`** - Dataset model and registry client
- **QLever** - High-performance SPARQL engine for analyzing large RDF dumps
- **GraphDB** - Triple store for storing analysis results (optional)

### Project-specific Code
- `src/main.ts` - Pipeline wiring and configuration
- `src/config.ts` - Environment variable schema
- `src/subjectFilters.ts` - Dataset selection with subject filter enrichment
- `src/uriSpaces.ts` - URI space map from the Network of Terms catalog
- `src/reporter.ts` - Console progress reporter with spinners

### Environment Configuration
The pipeline uses environment variables (see `src/config.ts`):
- `SPARQL_UPDATE_URL` - SPARQL UPDATE endpoint for writing results (optional)
- `SPARQL_UPDATE_AUTHORIZATION` - Authorization header value for the SPARQL endpoint (optional)
- `QLEVER_ENV` - Run QLever in "docker" or "native" mode (default: "docker")
- `QLEVER_PORT` - QLever HTTP port (default: 7001)
- `QLEVER_IMAGE` - QLever Docker image to use
