# NDE Dataset Knowledge Graph Pipeline

The NDE Dataset Knowledge Graph helps researchers, software developers and others to **find relevant datasets** for their
projects.
It contains [**Dataset Summaries**](#dataset-summaries) that provide information about datasets

This repository is the [data pipeline](#pipeline-steps) that generates the Knowledge Graph.

## Finding datasets

To query the Knowledge Graph, use the SPARQL endpoint at 
`https://triplestore.netwerkdigitaalerfgoed.nl/repositories/knowledge-graph`.

Some example queries (make sure to select repository `knowledge-graph` on the top right):

* [links from datasets to terminology sources](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?name=Datasets%20met%20een%20linked%20data%20distributie&infer=true&sameAs=true&query=%23%20Outgoing%20links%20from%20datasets%20to%20terminology%20sources%0APREFIX%20void%3A%20%3Chttp%3A%2F%2Frdfs.org%2Fns%2Fvoid%23%3E%0A%0Aselect%20*%20%7B%0A%20%20%20%20%3Fs%20a%20void%3ALinkset%20%3B%0A%20%20%20%20%20%20%20void%3AsubjectsTarget%20%3Fdataset%20%3B%0A%20%20%20%20%20%20%20void%3AobjectsTarget%20%3FterminologySource%20%3B%0A%20%20%20%20%20%20%20void%3Atriples%20%3FnumberOfTriples%20%3B%0A%7D)
* [property partitions per class](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=Knowledge%20Graph%3A%20property%20partition%20per%20class&owner=admin)
* [percentage of URI objects vs literals](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?name=&infer=true&sameAs=true&query=PREFIX%20void%3A%20%3Chttp%3A%2F%2Frdfs.org%2Fns%2Fvoid%23%3E%0APREFIX%20nde%3A%20%3Chttps%3A%2F%2Fwww.netwerkdigitaalerfgoed.nl%2Fdef%23%3E%0ASELECT%20%3Fdataset%20%3FnumberOfLiteralObjects%20%3FnumberOfURIObjects%20(ROUND(%3FnumberOfURIObjects%20%2F%20(%3FnumberOfLiteralObjects%20%2B%20%3FnumberOfURIObjects)%20*%20100)%20as%20%3FpercentageURIObjects)%20%7B%0A%20%20%20%20%3Fdataset%20a%20void%3ADataset%20%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20nde%3AdistinctObjectsLiteral%20%3FnumberOfLiteralObjects%20%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20nde%3AdistinctObjectsURI%20%3FnumberOfURIObjects%20%3B%0A%7D%0A)

## Approach

The Knowledge Graph is built on top of
the [Dataset Register](https://github.com/netwerk-digitaal-erfgoed/dataset-register), which contains dataset
descriptions as supplied by their owners. Part of these descriptions are distributions, i.e. URLs where the data can be
retrieved.

The Knowledge Graph loads RDF data from those distributions and applies SPARQL queries to it to build **Dataset
Summaries**. Summaries answer questions such as:

- which [RDF types](#classes) are used in the dataset?
- for each of those types, [how many resources](#classes) does the dataset contain?
- which [predicates](#properties) are used in the dataset?
- for each of those predicates, [how many subjects](#properties) have it?
- similarly, [how many subjects of each type](#property-density-per-subject-class) have the predicate?
- which [URI prefixes](#outgoing-links) does the dataset link to?
- for each of those prefixes, which match known [terminology sources](https://termennetwerk.netwerkdigitaalerfgoed.nl)?
- for each of those sources, [how many outgoing links](#outgoing-links) to them does the dataset have?
- (and more)

The Summaries can be consulted by users such as data platform builders to help them find relevant datasets.

## Scope

This pipeline:

- is RDF-based so will be limited to datasets that provide at least one valid RDF distribution;
- will skip RDF distributions that contain invalid data.

## Dataset Summaries

The [pipeline](#pipeline-steps) produces a set of Dataset Summaries. [VoID](https://www.w3.org/TR/void/#statistics) is
used as the data model for these Summaries.

### Size

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:distinctSubjects 53434; 
    void:distinctObjects 32323;
    void:properties 943;
    void:entities 8493. # To be an entity in a dataset, a resource must have a URI, and the URI must match the dataset's void:uriRegexPattern, if any. 
```

### Classes

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:classPartition [
        void:class schema:VisualArtWork;
        void:entities 312000;
    ],
    [
        void:class schema:Person;
        void:entities 980;
    ].
```

### Properties

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:propertyPartition [
        void:property schema:name;
        void:entities 203000;
    ],
    [
        void:property schema:birthDate;
        void:entities 19312;
    ].
```

### Property density per subject class

Nest a `void:propertyPartition` in `void:classPartition`:

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:classPartition [
        void:class schema:Person;
        void:propertyPartition [
            void:property schema:name;
            void:entities 155;
        ],
        [
            void:property schema:birthDate;
            void:entities 76;
        ]
    ],
    [
        void:class schema:VisualArtWork;
        void:propertyPartition [
            void:property schema:name;
            void:entities 1200;
        ],
        [
            void:property schema:image;
            void:entities 52;
        ]
    ].
```

### Outgoing links

Modelled as `void:Linkset`s:

```ttl
[] a void:Linkset;
    void:subjectsTarget <http://data.bibliotheken.nl/id/dataset/rise-alba>;
    void:objectsTarget <http://data.bibliotheken.nl/id/dataset/persons>;
    void:subset <http://data.bibliotheken.nl/id/dataset/rise-alba>; # The dataset that contains the links.
    void:triples 434 .
[] a void:Linkset;
    void:subjectsTarget <http://data.bibliotheken.nl/id/dataset/rise-alba>;
    void:objectsTarget <https://data.cultureelerfgoed.nl/term/id/cht>;
    void:triples 9402.
```

Use a list of fixed URI prefixes to match against, from the Network of Terms and in addition a custom list in the
pipeline itself.

### Vocabularies

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:vocabulary <https://schema.org/>, <http://www.w3.org/2000/01/rdf-schema#>, <http://xmlns.com/foaf/0.1/>.
```

### Distributions

All declared RDF distributions are validated:

* SPARQL endpoints are tested with a simple `SELECT * { ?s ?p ?o } LIMIT 1` query;
* RDF data downloads are tested with an HTTP HEAD request.

If the distributions are valid, they are stored in `void:sparqlEndpoint` and/or `void:dataDump` triples:
 
```ttl
<https://lod.uba.uva.nl/UB-UVA/Books>
    void:sparqlEndpoint <https://lod.uba.uva.nl/UB-UVA/Catalogue/sparql/> ;
    void:dataDump <https://lod.uba.uva.nl/_api/datasets/UB-UVA/Books/download.nt.gz?> .
```

The Schema.org ontology is used to supplement VoID in providing additional details about the distributions, retrieved
from the HTTP HEAD response, if available:

```ttl
<https://lod.uba.uva.nl/_api/datasets/UB-UVA/Books/download.nt.gz?> 
    <https://schema.org/dateModified> "2023-11-03T23:55:38.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
    <https://schema.org/contentSize> 819617127.

[] a <https://schema.org/Action>;
    <https://schema.org/target> <https://lod.uba.uva.nl/UB-UVA/Catalogue/sparql/>;
    <https://schema.org/result> <https://lod.uba.uva.nl/UB-UVA/Catalogue/sparql/>.
    
[] a <https://schema.org/Action>;
    <https://schema.org/target> <https://lod.uba.uva.nl/_api/datasets/UB-UVA/Books/download.nt.gz?>;
    <https://schema.org/result> <https://lod.uba.uva.nl/_api/datasets/UB-UVA/Books/download.nt.gz?>.   
```

If a distribution is invalid, a `schema:error` triple will indicate the HTTP status code:

```ttl
[] a <https://schema.org/Action>;
    <https://schema.org/target> <https://www.openarchieven.nl/foundlinks/linkset/33ff3fa4744db564807b99dbc4a3d012.nt.gz>;
    <https://schema.org/error> <https://www.w3.org/2011/http-statusCodes#NotFound>.
```

### Example resources

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:exampleResource <http://data.bibliotheken.nl/doc/alba/p418213178>, 
        <http://data.bibliotheken.nl/doc/alba/p416673600>.
```

## Run the pipeline

To run the pipeline yourself, start by cloning this repository. Then execute:

    npm install
    npm run dev

The [Dataset Summaries](#dataset-summaries) output will be written to the `output/` directory.

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
