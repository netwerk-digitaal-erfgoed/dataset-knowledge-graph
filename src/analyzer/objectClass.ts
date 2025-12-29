import {PerClassAnalyzer} from './perClass.js';

/**
 * Two-phase analyzer for class+property object class partitions.
 */
export class ObjectClassAnalyzer extends PerClassAnalyzer {
  public readonly name = 'class-property-object-classes';

  public static async create(): Promise<ObjectClassAnalyzer> {
    return new ObjectClassAnalyzer(
      await PerClassAnalyzer.loadQuery('class-property-object-classes.rq'),
    );
  }
}
