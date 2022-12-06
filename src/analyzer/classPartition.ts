import {QueryEngine} from '@comunica/query-sparql';
import {SparqlQueryAnalyzer} from '../analyzer';

export class ClassPartition extends SparqlQueryAnalyzer {
  constructor(queryEngine: QueryEngine) {
    super(queryEngine, query);
  }
}

/*
Either:
 - make the queries smart, so their output can be inserted into the triple store right away
 - or keep the queries simple and add prov etc. data to their output.

 We may want to add to the output data in a way that is impossible with CONSTRUCT.
 For example when consulting our list of terminology sources for cross-referencing.
 */

const query = `
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX void: <http://rdfs.org/ns/void#>

CONSTRUCT {
  ?analysis a void:Dataset ; 
    void:classPartition [
      void:class ?class;
      void:entities ?number;
    ] .
    
  ?analysis a prov:Entity ;
    prov:wasDerivedFrom ?dataset ;
    prov:wasGeneratedBy ?activity ;
    prov:wasAttributedTo <https://netwerkdigitaalerfgoed.nl/knowledge-graph> .
    
  ?activity a prov:Activity ;
    prov:endedAtTime ?endedAtTime ;
    prov:wasAssociatedWith <https://netwerkdigitaalerfgoed.nl/knowledge-graph> .
} 
WHERE {
  SELECT DISTINCT ?type (COUNT(?type) as ?number) {
    ?s a ?type
  }
  GROUP BY ?type ORDER BY DESC(?aantal)
}`;
