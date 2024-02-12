import {
  RdfDumpImporter,
  SparqlClient,
  ImportSuccessful,
  ImportFailed,
} from '../src/importer.js';
import {Dataset, Distribution} from '../src/dataset.js';
import {NotSupported} from '../src/pipeline.js';
// eslint-disable-next-line node/no-unpublished-import
import {jest} from '@jest/globals';

describe('RdfDumpImporter', () => {
  describe('import', () => {
    const succesSparqlClient: SparqlClient = {
      import: () => Promise.resolve(new ImportSuccessful('foo', 'bar')),
    };

    it('should return not supported for dataset without download distributions', async () => {
      const dataset = new Dataset('http://example.org/dataset', []);
      const importer = new RdfDumpImporter(succesSparqlClient);
      const result = await importer.import(dataset);

      expect(result).toBeInstanceOf(NotSupported);
      expect(result).toHaveProperty('message', 'No data dump available');
    });

    it('should successfully import all downloadable distributions', async () => {
      const distribution1 = new Distribution();
      distribution1.isValid = true;
      distribution1.accessUrl = 'foo.nt.gz';
      const distribution2 = new Distribution();
      distribution2.isValid = true;
      distribution2.mimeType = 'text/turtle';
      distribution2.accessUrl = 'bar.ttl';
      const dataset = new Dataset('http://example.org/dataset', [
        distribution1,
        distribution2,
      ]);
      const importSpy = jest.spyOn(succesSparqlClient, 'import');
      const importer = new RdfDumpImporter(succesSparqlClient);

      const result = await importer.import(dataset);

      // TODO: shouldn't this be 2?
      expect(importSpy).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(ImportSuccessful);
    });

    it('should return import failed if sparql client reports failure', async () => {
      const distribution1 = new Distribution();
      distribution1.isValid = true;
      distribution1.accessUrl = 'foo.nt.gz';
      const dataset = new Dataset('http://example.org/dataset', [
        distribution1,
      ]);
      const sparqlClient: SparqlClient = {
        import: () => Promise.resolve(new ImportFailed('foo', 'bar')),
      };
      const importer = new RdfDumpImporter(sparqlClient);
      const result = await importer.import(dataset);

      expect(result).toBeInstanceOf(ImportFailed);
    });
  });
});
