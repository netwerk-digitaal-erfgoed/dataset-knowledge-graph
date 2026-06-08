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
- does the dataset conform to [SCHEMA-AP-NDE](#schema-ap-nde-conformance)?
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

### Media

Whether a dataset exposes *any* media — images, audio, video, 3D — is reported
as a `void:subset` marked
`<https://def.nde.nl/probe#detects> <https://def.nde.nl/probe#media>`. The
subset exists iff the dataset has media, so its presence is the `has-media`
signal: a media-bearing dataset that offers no IIIF is then observable as
“media, but no IIIF” rather than indistinguishable from “no media”.

Media is detected by a deliberately wide but curated allowlist of media
*predicates* spanning schema.org, EDM, CIDOC-CRM, Linked Art, FOAF, Omeka and a
few bespoke heritage vocabularies (see `queries/analysis/media.rq`). False
friends are excluded — e.g. `crm:P16_used_specific_object` (a tool, not a
digital object) and `schema:depicts` (subject matter, not a media link). Each
present predicate becomes a self-describing `void:propertyPartition`; the
subset’s aggregate `void:entities` is the **MAX** over those partitions — a
double-count-safe lower bound on the number of media objects (one record often
carries `image` + `thumbnailUrl` + `contentUrl`, so summing would treble-count
it).

```ttl
<https://example.com/dataset> a void:Dataset;
    void:subset [
        <https://def.nde.nl/probe#detects> <https://def.nde.nl/probe#media> ;
        void:entities 104276 ;
        void:propertyPartition
            [ void:property <https://schema.org/contentUrl> ; void:entities 104276 ],
            [ void:property <https://schema.org/thumbnailUrl> ; void:entities 104276 ] .
    ].
```

### IIIF Presentation manifests

Datasets that expose [IIIF Presentation API](http://iiif.io/api/presentation/)
manifests get a `void:subset` keyed on
`dcterms:conformsTo <http://iiif.io/api/presentation/>` with a `void:entities`
count of distinct manifests. Detection is **decoupled** from
[SCHEMA-AP-NDE](https://docs.nde.nl/schema-profile/) conformance (issue #314): a
manifest counts as IIIF *capability* if its `schema:encodingFormat` literal is
either the full profile pattern *or* the bare `application/ld+json` media type —
so a working manifest declared without the `;profile=` parameter is not missed.
The profile-conformant manifests are emitted as a *nested* `void:subset` keyed
on `dcterms:conformsTo <https://docs.nde.nl/schema-profile/>`, encoding
`conformant ⊆ capability`. The capability subset in turn nests under the
dataset’s media subset (`iiif ⊆ media`). v2 and v3 manifests are collapsed into
a single, version-less subset. Detection uses `STRSTARTS` / `STRENDS` rather
than a regex (a regex over every `encodingFormat` literal is costly on QLever
and on remote endpoints alike); the version segment is left unconstrained, which
is intentionally forwards-compatible with future Presentation API versions.

```ttl
<https://example.com/dataset> a void:Dataset;
    void:subset [
        dcterms:conformsTo <http://iiif.io/api/presentation/> ;  # capability
        void:entities 42 ;
        void:subset [
            dcterms:conformsTo <https://docs.nde.nl/schema-profile/> ;  # conformance
            void:entities 37 .
        ] .
    ].
```

#### Validated conformance

The `dcterms:conformsTo` marker above is **declared**: it records only that the
dataset’s own RDF claims IIIF conformance. To distinguish a dataset that serves
working manifests from one that merely claims to, a first-N sample (default 10)
of the matched manifest IRIs is dereferenced via
[`@lde/iiif-validator`](https://www.npmjs.com/package/@lde/iiif-validator) —
each is checked to be a real IIIF Presentation Manifest (HTTP 2xx, parses as
JSON, an IIIF Presentation `@context`, and a manifest `type`). Throttled
dereferencing (≤ 4 concurrent) keeps the load off heritage hosts; a single
broken manifest is one tick in a ratio, so there are no retries.

The declared marker is **never removed** — it is the neutral statistic. The
validation outcome is added alongside it as two
[DQV](https://www.w3.org/TR/vocab-dqv/) integer measurements plus a
[PROV](https://www.w3.org/TR/prov-o/) activity. The measurements are
`dqv:computedOn` the **capability subset** — the resource they actually describe
— which already carries the `dcterms:conformsTo` marker, so no per-measurement
profile back-link is needed. For backward compatibility the measurements are
*also* linked from the dataset (`?dataset dqv:hasQualityMeasurement …`), the
path earlier consumers read; that link is transitional and will be dropped once
consumers navigate via `void:subset`:

```ttl
@prefix dqv:  <http://www.w3.org/ns/dqv#> .
@prefix prov: <http://www.w3.org/ns/prov#> .

<https://example.org/dataset/.well-known/void#iiif-…>
    dqv:hasQualityMeasurement
        [ a dqv:QualityMeasurement ;
          dqv:computedOn <https://example.org/dataset/.well-known/void#iiif-…> ;
          dqv:isMeasurementOf <https://def.nde.nl/metric#manifests-sampled> ;
          dqv:value 10 ;
          prov:wasGeneratedBy _:validation ] ,
        [ a dqv:QualityMeasurement ;
          dqv:computedOn <https://example.org/dataset/.well-known/void#iiif-…> ;
          dqv:isMeasurementOf <https://def.nde.nl/metric#manifests-validated> ;
          dqv:value 7 ;
          prov:wasGeneratedBy _:validation ] .

_:validation
    a prov:Activity ;
    prov:used <https://example.org/dataset>, <http://iiif.io/api/presentation/> ;
    prov:wasAssociatedWith <https://www.npmjs.com/package/@lde/iiif-validator> .
```

| Metric IRI | Type | Meaning |
|---|---|---|
| `…/metric#manifests-sampled` | `xsd:integer` | Number of manifest IRIs dereferenced — the denominator `N`. At most the configured sample size (10). |
| `…/metric#manifests-validated` | `xsd:integer` | How many of the sampled manifests `k` resolved to a valid IIIF Presentation Manifest. |

No float ratio and no baked threshold are emitted: consumers derive `k / N` and
pick their own bar. The only non-arbitrary cut is `validated = 0` versus
`validated > 0`. The DKG stays signal-only; a consumer composes these orthogonal
signals into a verdict. Combining the media subset, the capability/conformance
subsets and the validated count yields a gradient:

| State | media subset | capability subset | conformance sub-subset | validated |
|---|---|---|---|---|
| No media | absent | – | – | – |
| Media, no IIIF | present | absent | – | – |
| IIIF declared but failing | present | present | – | 0 |
| IIIF working, non-conformant | present | present | absent / 0 | ≥ 1 |
| IIIF working and conformant | present | present | present, ≥ 1 | ≥ 1 |

#### Querying

“Find datasets whose IIIF manifests actually resolve”:

```sparql
PREFIX dqv: <http://www.w3.org/ns/dqv#>
PREFIX void: <http://rdfs.org/ns/void#>

SELECT ?dataset WHERE {
    ?dataset void:subset/dqv:hasQualityMeasurement [
        dqv:isMeasurementOf <https://def.nde.nl/metric#manifests-validated> ;
        dqv:value ?validated
    ] .
    FILTER(?validated > 0)
}
```

“Find datasets that have media but expose no IIIF” (the publishers to nudge):

```sparql
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX void: <http://rdfs.org/ns/void#>

SELECT ?dataset WHERE {
    ?dataset void:subset [
        <https://def.nde.nl/probe#detects> <https://def.nde.nl/probe#media>
    ] .
    FILTER NOT EXISTS {
        ?dataset void:subset/void:subset [
            dcterms:conformsTo <http://iiif.io/api/presentation/>
        ] .
    }
}
```

“Find datasets that declare IIIF but whose sampled manifests all fail” (the
diagnostic query for giving publishers feedback):

```sparql
PREFIX dqv: <http://www.w3.org/ns/dqv#>
PREFIX void: <http://rdfs.org/ns/void#>

SELECT ?dataset WHERE {
    ?dataset void:subset/dqv:hasQualityMeasurement [
        dqv:isMeasurementOf <https://def.nde.nl/metric#manifests-validated> ;
        dqv:value 0
    ] .
}
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

### SCHEMA-AP-NDE conformance

The Summary embeds [DQV](https://www.w3.org/TR/vocab-dqv/) quality measurements
summarising the dataset’s conformance to the
[NDE Schema.org Application Profile](https://github.com/netwerk-digitaal-erfgoed/schema-profile),
along with a [PROV](https://www.w3.org/TR/prov-o/) activity describing the
validation run:

```ttl
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dqv:     <http://www.w3.org/ns/dqv#> .
@prefix prov:    <http://www.w3.org/ns/prov#> .

<https://example.org/dataset>
    dqv:hasQualityMeasurement
        [ a dqv:QualityMeasurement ;
          dqv:computedOn <https://example.org/dataset> ;
          dqv:isMeasurementOf <https://def.nde.nl/metric#schema-ap-nde-sample-conformance> ;
          dqv:value true ;
          dcterms:conformsTo <https://docs.nde.nl/schema-profile/> ;
          prov:wasGeneratedBy _:validation ],
        [ a dqv:QualityMeasurement ;
          dqv:computedOn <https://example.org/dataset> ;
          dqv:isMeasurementOf <https://def.nde.nl/metric#quads-validated> ;
          dqv:value 5234 ;
          prov:wasGeneratedBy _:validation ],
        [ a dqv:QualityMeasurement ;
          dqv:computedOn <https://example.org/dataset> ;
          dqv:isMeasurementOf <https://def.nde.nl/metric#samples-per-class> ;
          dqv:value 50 ;
          prov:wasGeneratedBy _:validation ] .

_:validation
    a prov:Activity ;
    prov:used <https://example.org/dataset>, <https://docs.nde.nl/schema-profile/> ;
    prov:wasAssociatedWith <https://www.npmjs.com/package/@lde/pipeline-shacl-validator> .
```

Three measurements are emitted per dataset:

| Metric IRI | Type | Meaning |
|---|---|---|
| `…/metric#schema-ap-nde-sample-conformance` | `xsd:boolean` | Whether the sampled resources conformed to SCHEMA-AP-NDE’s SHACL shapes. Carries `dcterms:conformsTo` so consumers reach the profile IRI via the DQV path alone. |
| `…/metric#quads-validated` | `xsd:integer` | Number of quads the validator inspected — the union of the per-class sample subgraphs. Contextualises the conformance verdict by indicating coverage. |
| `…/metric#samples-per-class` | `xsd:integer` | Configured sample cap per `sh:targetClass`. Currently 50. Same value across all datasets in a given pipeline run; included so consumers can interpret the coverage figure. |

The conformance measurement has three observable states, distinguished by combining `dqv:value` with `quads-validated`:

| `quads-validated` | `dqv:value` (conformance) | Interpretation |
|---|---|---|
| > 0 | `true` | Sampled resources passed all SHACL constraints |
| > 0 | `false` | At least one sampled resource violated a SHACL constraint |
| 0 | `true` (vacuous) | The dataset uses no SCHEMA-AP-NDE `sh:targetClass`; the profile doesn’t apply |

The third row is SHACL’s vacuous-truth rule: an empty target set is, by definition, conformant. A consumer looking for ‘tested and passed’ should always combine the conformance measurement with `quads-validated > 0`; the example queries below show how. Treating ‘not applicable’ as non-conformant would conflate datasets that use a different data model (e.g. Linked.Art, EDM-only) with datasets that try SCHEMA-AP-NDE and fail — only the latter is the interesting case.

The detailed `sh:ValidationReport` with per-resource violations stays in
`output/validation/<dataset>.ttl`, **not** in the SPARQL store, to avoid
bloating it on badly non-conformant datasets.

#### Querying

“Find datasets that tried SCHEMA-AP-NDE and passed”:

```sparql
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX dqv:     <http://www.w3.org/ns/dqv#>

SELECT ?dataset WHERE {
    ?dataset dqv:hasQualityMeasurement
        [ dqv:value true ;
          dcterms:conformsTo <https://docs.nde.nl/schema-profile/> ],
        [ dqv:isMeasurementOf <https://def.nde.nl/metric#quads-validated> ;
          dqv:value ?n ] .
    FILTER(?n > 0)
}
```

“Find datasets that tried SCHEMA-AP-NDE and failed” (the common diagnostic query):

```sparql
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX dqv:     <http://www.w3.org/ns/dqv#>

SELECT ?dataset WHERE {
    ?dataset dqv:hasQualityMeasurement [
        dqv:value false ;
        dcterms:conformsTo <https://docs.nde.nl/schema-profile/>
    ] .
}
```

“Find datasets where the profile doesn’t apply” (`quads-validated = 0`):

```sparql
PREFIX dqv:  <http://www.w3.org/ns/dqv#>

SELECT ?dataset WHERE {
    ?dataset dqv:hasQualityMeasurement [
        dqv:isMeasurementOf <https://def.nde.nl/metric#quads-validated> ;
        dqv:value 0
    ] .
}
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

### 4. Validate against SCHEMA-AP-NDE

Sample a configurable number of resources per `sh:targetClass` declared in the
[NDE Schema.org Application Profile](https://github.com/netwerk-digitaal-erfgoed/schema-profile)
SHACL shapes and validate the samples. Per-dataset SHACL validation reports are
written to `output/validation/<dataset>.ttl`.

### 5. Quality measurements

Summarise the validation result as [DQV](https://www.w3.org/TR/vocab-dqv/)
measurements + a [PROV](https://www.w3.org/TR/prov-o/) activity describing the
validation run, and append them to the dataset’s Summary. See
[SCHEMA-AP-NDE conformance](#schema-ap-nde-conformance) for the output shape
and example queries.

### 6. Write analysis results

Write the analysis results to local files and a triple store.
