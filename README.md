# NDE Dataset Knowledge Graph Pipeline

The NDE Dataset Knowledge Graph helps researchers, software developers and others to **find relevant datasets** for their
projects.
It consists of [**Dataset Summaries**](#dataset-summaries) that provide statistical information about datasets.

This repository is the [data pipeline](#pipeline-steps) that generates the Knowledge Graph.

## Finding datasets

To query the Knowledge Graph, use the SPARQL endpoint at 
`https://triplestore.netwerkdigitaalerfgoed.nl/repositories/dataset-knowledge-graph`.

Some example queries (make sure to select repository `dataset-knowledge-graph` on the top right):

* [links from datasets to terminology sources](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?name=Datasets%20met%20een%20linked%20data%20distributie&infer=true&sameAs=true&query=%23%20Outgoing%20links%20from%20datasets%20to%20terminology%20sources%0APREFIX%20void%3A%20%3Chttp%3A%2F%2Frdfs.org%2Fns%2Fvoid%23%3E%0A%0Aselect%20*%20%7B%0A%20%20%20%20%3Fs%20a%20void%3ALinkset%20%3B%0A%20%20%20%20%20%20%20void%3AsubjectsTarget%20%3Fdataset%20%3B%0A%20%20%20%20%20%20%20void%3AobjectsTarget%20%3FterminologySource%20%3B%0A%20%20%20%20%20%20%20void%3Atriples%20%3FnumberOfTriples%20%3B%0A%7D)
* [property partitions per class](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=Property%20partitions%20per%20class&owner=admin)
* [percentage of URI objects vs literals](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?name=&infer=true&sameAs=true&query=PREFIX%20void%3A%20%3Chttp%3A%2F%2Frdfs.org%2Fns%2Fvoid%23%3E%0APREFIX%20nde%3A%20%3Chttps%3A%2F%2Fwww.netwerkdigitaalerfgoed.nl%2Fdef%23%3E%0ASELECT%20%3Fdataset%20%3FnumberOfLiteralObjects%20%3FnumberOfURIObjects%20(ROUND(%3FnumberOfURIObjects%20%2F%20(%3FnumberOfLiteralObjects%20%2B%20%3FnumberOfURIObjects)%20*%20100)%20as%20%3FpercentageURIObjects)%20%7B%0A%20%20%20%20%3Fdataset%20a%20void%3ADataset%20%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20nde%3AdistinctObjectsLiteral%20%3FnumberOfLiteralObjects%20%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20nde%3AdistinctObjectsURI%20%3FnumberOfURIObjects%20%3B%0A%7D%0A)

[This datastory](https://datastories.demo.netwerkdigitaalerfgoed.nl/dataset-knowledge-graph/) shows more queries
against the Knowledge Graph.   

## Approach

The Knowledge Graph contains **Dataset Summaries** that answer questions such as:

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

It is built on top of the [Dataset Register](https://github.com/netwerk-digitaal-erfgoed/dataset-register), which contains dataset descriptions as supplied by
their owners. Part of these descriptions are distributions, i.e. URLs where the data can be retrieved.

To build the Summaries, the Knowledge Graph Pipeline applies [SPARQL queries](queries/analysis) against RDF 
distributions, either directly in case of SPARQL endpoints or by loading the data first in case of RDF data dumps.
Where needed, the SPARQL results are post-processed in code.

## Scope

This pipeline:

- is RDF-based so will be limited to datasets that provide at least one valid RDF distribution;
- will skip RDF distributions that contain invalid data.

## Dataset Summaries

The [pipeline](#pipeline-steps) produces a set of Dataset Summaries. [VoID](https://www.w3.org/TR/void/#statistics) is
used as the data model for these Summaries.

### Size

The overall size of the dataset: the number of unique subjects, predicates and literal as well as URI objects.

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:triples 6119677;
    void:distinctSubjects 53434; 
    void:properties 943;
    nde:objectsLiteral 3911;
    nde:distinctObjectsLiteral 2125;
    nde:objectsURI 32323;
    nde:distinctObjectsURI 32323.
```

### Classes

The RDF subject classes that occur in the dataset, and for each class, the number of instances.

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

The predicates that occur in the dataset, and for each predicate, the number of entities that have that predicate
as well as the number of distinct objects.

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:propertyPartition [
        void:property schema:name; 
        void:entities 203000;         # 20.300 resources have a schema:name.
        void:distinctObjects 20000;   # These resources have a total of 20.000 unique names.   
    ],
    [
        void:property schema:birthDate;
        void:entities 19312;
        void:distinctObjects 19312;
    ].
```

### Property density per subject class

The predicates per subject class, and for each predicate, the number of entities that have that predicate
as well as the number of distinct objects.

Nest a `void:propertyPartition` in `void:classPartition`:

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:classPartition [
        void:class schema:Person;
        void:propertyPartition [
            void:property schema:name;   # This partition is about schema:Persons with a schema:name.
            void:entities 155;           # 155 persons have a name.
            void:distinctObjects 205;    # These 155 persons have a total of 205 unique names, because some persons have multiple names.
        ],
        [
            void:property schema:birthDate;
            void:entities 76;
            void:distinctObjects 76;
        ]
    ],
    [
        void:class schema:VisualArtWork;
        void:propertyPartition [
            void:property schema:name;
            void:entities 1200;
            void:distinctObjects 1200;
        ],
        [
            void:property schema:image;
            void:entities 52;
            void:distinctObjects 20;
        ]
    ].
```

### Datatypes per class and property

The datatypes used for literal values, broken down by subject class and property:

```ttl
@prefix void: <http://rdfs.org/ns/void#> .
@prefix void-ext: <http://ldf.fi/void-ext#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix schema: <https://schema.org/> .

<https://example.org/dataset> a void:Dataset;
    void-ext:datatypes 5;                              # 5 distinct datatypes in the dataset.
    void-ext:datatype xsd:string, xsd:date, xsd:integer, xsd:boolean, rdf:langString;
    void:classPartition [
        void:class schema:Person;
        void:propertyPartition [
            void:property schema:name;
            void-ext:datatypePartition [
                void-ext:datatype xsd:string;
                void:triples 155;                      # 155 triples with xsd:string values.
            ],
            [
                void-ext:datatype rdf:langString;
                void:triples 42;                       # 42 triples with language-tagged strings.
            ]
        ],
        [
            void:property schema:birthDate;
            void-ext:datatypePartition [
                void-ext:datatype xsd:date;
                void:triples 76;
            ]
        ]
    ].
```

### Languages per class and property

The language tags used for literal values, broken down by subject class and property:

```ttl
@prefix void: <http://rdfs.org/ns/void#> .
@prefix void-ext: <http://ldf.fi/void-ext#> .
@prefix schema: <https://schema.org/> .

<https://example.org/dataset> a void:Dataset;
    void:classPartition [
        void:class schema:Person;
        void:propertyPartition [
            void:property schema:name;
            void-ext:languagePartition [
                void-ext:language "en";
                void:triples 1200;                     # 1200 triples with English names.
            ],
            [
                void-ext:language "nl";
                void:triples 850;                      # 850 triples with Dutch names.
            ]
        ],
        [
            void:property schema:description;
            void-ext:languagePartition [
                void-ext:language "en";
                void:triples 500;
            ]
        ]
    ].
```

### Object classes per class and property

The classes of object resources, broken down by subject class and property. This shows how classes are connected through properties:

```ttl
@prefix void: <http://rdfs.org/ns/void#> .
@prefix void-ext: <http://ldf.fi/void-ext#> .
@prefix schema: <https://schema.org/> .

<https://example.org/dataset> a void:Dataset;
    void:classPartition [
        void:class schema:Book;
        void:propertyPartition [
            void:property schema:author;
            void:entities 1200;
            void:distinctObjects 450;
            void-ext:objectClassPartition [
                void:class schema:Person;       # Objects are of class schema:Person.
                void:triples 1350;              # 1350 triples link Books to Persons.
            ],
            [
                void:class schema:Organization;
                void:triples 50;                # 50 triples link Books to Organizations.
            ]
        ]
    ].
```

This shows that 1200 `schema:Book` resources use `schema:author` to link to `schema:Person` (1350 triples) and `schema:Organization` (50 triples) resources.

### Outgoing links to terminology sources

Outgoing links to terminology sources in the [Network of Terms](https://termennetwerk.netwerkdigitaalerfgoed.nl),
modelled as `void:Linkset`s:

```ttl
[] a void:Linkset;
    void:subjectsTarget <http://data.bibliotheken.nl/id/dataset/rise-alba>;
    void:objectsTarget <http://data.bibliotheken.nl/id/dataset/persons>;
    void:triples 434 .
[] a void:Linkset;
    void:subjectsTarget <http://data.bibliotheken.nl/id/dataset/rise-alba>;
    void:objectsTarget <https://data.cultureelerfgoed.nl/term/id/cht>;
    void:triples 9402.
```

Uses a list of fixed URI prefixes to match against, from the Network of Terms and in addition a custom list in the
pipeline itself.

### Subject URI spaces

The most common URI namespaces used for subject resources in the dataset:

```ttl
<https://example.org/dataset> a void:Dataset;
    void:subset [
        void:uriSpace "https://n2t.net/ark:/70115/";
        void:entities 312000;
    ],
    [
        void:uriSpace "https://data.example.org/subjects/";
        void:entities 53434;
    ].
```

### Vocabularies

The vocabularies that the dataset’s predicates refer to:

```ttl
<http://data.bibliotheken.nl/id/dataset/rise-alba> a void:Dataset;
    void:vocabulary <http://schema.org>, <http://xmlns.com/foaf/0.1/>.
```

### Licenses

Licenses that apply to resources in the dataset.

```tll
<https://example.com/dataset> a void:Dataset;
    void:subset [
        dcterms:license <http://creativecommons.org/publicdomain/mark/1.0/>,
        void:triples 120.
    ],
    [
        dcterms:license <http://creativecommons.org/publicdomain/mark/1.0/>,
        void:triples 120.
    ].
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

### Partition URIs

Partition resources (class partitions, property partitions, etc.) use well-known URIs based on the dataset URI:

```
{dataset-uri}/.well-known/void#{partition-type}-{hash}
```

For example, a class partition for `schema:Person` in dataset `https://example.org/dataset` would have the URI:

```
https://example.org/dataset/.well-known/void#class-5f4d3c2b1a...
```

The hash is an MD5 of the class or property URI, ensuring stable and unique identifiers.

## Run the pipeline

To run the pipeline yourself, start by cloning this repository. Then execute:

    npm install
    npm run dev

The [Dataset Summaries](#dataset-summaries) output will be written to the `output/` directory.

## Pipeline Steps

The pipeline consists of the following steps.

### 1. Select

Select dataset descriptions with RDF distributions from the Dataset Register.

### 2. Load

If the dataset has no SPARQL endpoint distribution, load the data from an RDF dump distribution, if available.

### 3. Analyze

Apply Analyzers, either to the dataset provider’s SPARQL endpoint, or our own where we loaded the data. Analyzers are [SPARQL CONSTRUCT queries](queries/analysis/), wrapped in code where needed to extract
more detailed information. 
Analyzers output results as triples in the VoID vocabulary.

### 4. Write analysis results

Write the analysis results to local files and a triple store.
