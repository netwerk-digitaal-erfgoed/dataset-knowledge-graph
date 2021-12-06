# Knowledge Graph Pipeline

The Knowledge Graph will help builders of data platforms to find relevant datasets.

This repository is a proof of concept of a data pipeline for generating such a Knowledge Graph.

## Approach

The Knowledge Graph is built on top of
the [Dataset Register](https://github.com/netwerk-digitaal-erfgoed/dataset-register), which contains dataset
descriptions as supplied by their owners. Part of these descriptions are distributions, i.e. URLs where the data can be
retrieved.

The Knowledge Graph loads RDF data from the distributions and applies SPARQL queries to it to build **dataset
summaries**. Summaries answer questions such as:

- which RDF types are used in the dataset?
- for each of those types, how many resources does the dataset contain?
- which predicates are used in the dataset?
- which URI prefixes to the data link to?
- for each of those prefixes, which match known [terminology sources](https://termennetwerk.netwerkdigitaalerfgoed.nl)?
- for each of those sources, how many outgoing links to them does the dataset have?
- (and more)

The summaries can be consulted by users such as data platform builders to help them find relevant datasets.

## Scope

- This pipeline is RDF-based so will be limited to datasets that provide at least one valid RDF distribution.

## Pipeline Steps

The pipeline will consist of the following steps.

### 1. Retrieve datasets with RDF distributions from the Dataset Register.

The Knowledge Graph is limited in scope to RDF distributions.

### 2. Load RDF data from the distribution.

This can be either in-memory or in a triple store. The latter may perform better because we need to apply SPARQL queries
to the RDF.

### 3. Apply analysis queries to the loaded data.

There are two sets of queries:

- generic queries that apply to all datasets (for example all types);
- dataset-specific queries for extracting detailed information.

The SPARQL queries will be stored in this Git repository, in a predetermined directory structure. This way, no
configuration will be necessary.

All queries are SPARQL `CONSTRUCT` queries that output analysis results as triples (for example
in [VoID](https://www.w3.org/TR/void/)).

For now the queries will be self-contained, complete units. In the future, we may want to combine queries with extra
code (TypeScript) functions for extracting even more detailed information, such as image resolution.

### 4. Write analysis results

Write the results of the analysis queries to local files. The results may also be inserted into a triple store that can
then be consulted by clients as a Knowledge Graph.

# Commands for generating statics about data dumps

## These examples expect the Jena commandline tools and Graphdb commandline tools are installed and added to the $PATH

## Analyse properties

```bash
sparql --query analyse-properties.rq --data <path to data>
```

## Analyse classes

```bash
sparql --query analyse-classes.rq --data <path to data>
```

## Analyse outgoing links

```bash
sparql --query analyse-outgoinglinks.rq --data <path to data> 
```

# GraphDB queries

## Dataset Register

- [List of (selected) linked data distributions](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=Linked%20data%20distributies&owner=admin)

## Generic knowledge about dataset

- [exhaustive list of classes used in the dataset](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20exhaustive%20list%20of%20classes%20used%20in%20the%20dataset&owner=kg)
- [exhaustive list of properties used in the dataset](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20exhaustive%20list%20of%20properties%20used%20in%20the%20dataset&owner=kg)
- [table: class vs. total number of instances of the class](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20table%3A%20class%20vs.%20total%20number%20of%20instances%20of%20the%20class&owner=kg)
- [table: property vs. total number of distinct objects in triples using the property](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20table%3A%20property%20vs.%20total%20number%20of%20distinct%20objects%20in%20triples%20using%20the%20property&owner=kg)
- [table: property vs. total number of distinct subjects in triples using the property](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20table%3A%20property%20vs.%20total%20number%20of%20distinct%20subjects%20in%20triples%20using%20the%20property&owner=kg)
- [table: property vs. total number of triples using the property](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20table%3A%20property%20vs.%20total%20number%20of%20triples%20using%20the%20property&owner=kg)
- [table: used prefixes in URIs and count](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20table%3A%20used%20prefixes%20in%20URIs%20and%20count&owner=kg)
- [total number of distinct classes](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20total%20number%20of%20distinct%20classes&owner=kg)
- [total number of distinct object nodes](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20total%20number%20of%20distinct%20object%20nodes&owner=kg)
- [total number of distinct predicates](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20total%20number%20of%20distinct%20predicates&owner=kg)
- [total number of distinct resource URIs](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20total%20number%20of%20distinct%20resource%20URIs&owner=kg)
- [total number of distinct subject nodes](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20total%20number%20of%20distinct%20subject%20nodes&owner=kg)
- [total number of entities](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=KG%20-%20total%20number%20of%20entities&owner=kg)
