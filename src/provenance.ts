import {DatasetCore} from 'rdf-js';
import {DataFactory} from 'n3';
import quad = DataFactory.quad;
import namedNode = DataFactory.namedNode;
import blankNode = DataFactory.blankNode;
import literal = DataFactory.literal;

export function withProvenance(
  dataset: DatasetCore,
  iri: string,
  start: Date,
  end: Date
) {
  const activity = blankNode();
  dataset.add(
    quad(
      namedNode(iri),
      namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      namedNode('http://www.w3.org/ns/prov#Entity')
    )
  );
  dataset.add(
    quad(
      namedNode(iri),
      namedNode('http://www.w3.org/ns/prov#wasGeneratedBy'),
      activity
    )
  );
  dataset.add(
    quad(
      activity,
      namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      namedNode('http://www.w3.org/ns/prov#Activity')
    )
  );
  dataset.add(
    quad(
      activity,
      namedNode('http://www.w3.org/ns/prov#startedAtTime'),
      literal(
        start.toISOString(),
        namedNode('http://www.w3.org/2001/XMLSchema#dateTime')
      )
    )
  );
  dataset.add(
    quad(
      activity,
      namedNode('http://www.w3.org/ns/prov#endedAtTime'),
      literal(
        end.toISOString(),
        namedNode('http://www.w3.org/2001/XMLSchema#dateTime')
      )
    )
  );

  return dataset;
}
