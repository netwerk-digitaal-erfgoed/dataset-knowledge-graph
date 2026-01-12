import {PerClassAnalyzer} from './perClass.js';

/**
 * Two-phase analyzer for class+property language partitions.
 *
 * Extracts language tag statistics for literals per class and predicate.
 */
export class LanguageAnalyzer extends PerClassAnalyzer {
  public readonly name = 'class-property-languages';

  public static async create(): Promise<LanguageAnalyzer> {
    return new LanguageAnalyzer(
      await PerClassAnalyzer.loadQuery('class-property-languages.rq'),
    );
  }
}
