import DatasetExt from 'rdf-ext/lib/Dataset.js';
import {withProvenance} from '../src/provenance.js';
import factory from 'rdf-ext';

const objects = (dataset: DatasetExt) =>
  dataset.reduce((acc, quad) => {
    acc.push(quad.object.value);
    return acc;
  }, [] as string[]);

describe('withProvenance', () => {
  it('should add provenance data for iri', () => {
    const dataset = factory.dataset();
    const iri = 'http://example.org/foo';
    const start = new Date();
    const end = new Date();

    withProvenance(dataset, iri, start, end);

    expect(dataset.size).toBe(5);

    const types = objects(
      dataset.match(
        factory.namedNode(iri),
        factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      ),
    );

    expect(types).toContain('http://www.w3.org/ns/prov#Entity');

    const activities = objects(
      dataset.match(
        factory.namedNode(iri),
        factory.namedNode('http://www.w3.org/ns/prov#wasGeneratedBy'),
      ),
    );

    expect(activities.length).toBe(1);

    const activity = activities[0];

    const activityType = objects(
      dataset.match(
        factory.blankNode(activity),
        factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      ),
    );
    expect(activityType).toContain('http://www.w3.org/ns/prov#Activity');

    const startTime = objects(
      dataset.match(
        factory.blankNode(activity),
        factory.namedNode('http://www.w3.org/ns/prov#startedAtTime'),
      ),
    );
    expect(startTime).toContain(start.toISOString());

    const endTime = objects(
      dataset.match(
        factory.blankNode(activity),
        factory.namedNode('http://www.w3.org/ns/prov#endedAtTime'),
      ),
    );
    expect(endTime).toContain(end.toISOString());
  });
});
