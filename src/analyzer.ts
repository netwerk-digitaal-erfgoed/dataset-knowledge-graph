import {DatasetCore} from 'rdf-js';
import {Dataset} from './dataset';

export interface Analyzer {
  execute(
    dataset: Dataset
  ): Promise<DatasetCore | NotSupported | AnalyzerError>;
}

export class NotSupported {}
export class AnalyzerError {
  constructor(readonly distributionUrl: string, readonly message?: string) {}
}