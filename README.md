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

- [List of (selected) linked data distributions in Dataset Register](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=Linked%20data%20distributies&owner=admin)

