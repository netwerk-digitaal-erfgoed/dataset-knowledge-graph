import {PerClassAnalyzer} from './perClass.js';

/**
 * Two-phase analyzer for class+property datatype partitions.
 *
 * Dataset-level datatypes are handled separately by datatypes.rq.
 */
export class DatatypeAnalyzer extends PerClassAnalyzer {
  public readonly name = 'class-property-datatypes';

  public static async create(): Promise<DatatypeAnalyzer> {
    return new DatatypeAnalyzer(
      await PerClassAnalyzer.loadQuery('class-property-datatypes.rq'),
    );
  }
}
