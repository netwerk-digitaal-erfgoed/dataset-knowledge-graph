import {Dataset, Distribution} from '../src/dataset.js';

describe('Dataset', () => {
  describe('getSparqlDistribution', () => {
    it('should return a sparql distribution if available', () => {
      const distribution1 = Distribution.sparql(
        'http://example.org/sparql',
        'http://example.org/namedGraph'
      );
      const distribution2 = new Distribution();

      const dataset = new Dataset('http://example.org/dataset', [
        distribution1,
        distribution2,
      ]);

      const sparqlDistribution = dataset.getSparqlDistribution();

      expect(sparqlDistribution).toEqual(distribution1);
    });

    it('should return null distribution if no sparql distribution available', () => {
      const distribution1 = new Distribution();
      const distribution2 = new Distribution();

      const dataset = new Dataset('http://example.org/dataset', [
        distribution1,
        distribution2,
      ]);

      const sparqlDistribution = dataset.getSparqlDistribution();

      expect(sparqlDistribution).toBeNull();
    });
  });

  describe('getDownloadDistributions', () => {
    it('should return 0 distributions if none are actionable', () => {
      const distribution = new Distribution();
      distribution.isValid = true;

      const dataset = new Dataset('http://example.org/dataset', [distribution]);

      const downloadDistributions = dataset.getDownloadDistributions();
      expect(downloadDistributions.length).toBe(0);
    });

    it('should return valid and actionable distributions', () => {
      const distribution1 = new Distribution();
      distribution1.isValid = true;
      distribution1.mimeType = 'foo+gzip';
      const distribution2 = new Distribution();
      distribution2.isValid = true;
      distribution2.accessUrl = 'foo.nt.gz';
      const distribution3 = new Distribution();
      distribution3.isValid = true;
      distribution3.mimeType = 'text/turtle';
      const distribution4 = new Distribution();
      distribution4.isValid = true;

      const dataset = new Dataset('http://example.org/dataset', [
        distribution1,
        distribution2,
        distribution3,
        distribution4,
      ]);

      const downloadDistributions = dataset.getDownloadDistributions();
      expect(downloadDistributions.length).toBe(3);
    });
  });
});
