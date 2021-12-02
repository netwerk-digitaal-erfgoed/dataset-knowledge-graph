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
