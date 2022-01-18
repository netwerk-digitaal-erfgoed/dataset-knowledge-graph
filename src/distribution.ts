import {URL} from 'url';

export class Distribution {
  constructor(public readonly data_url: URL, public readonly dist_url: URL) {}

  get datasets() {
    return this.data_url;
  }

  get distributions() {
    return this.dist_url;
  }
}

export interface DistributionList {
  getDistributionList(): Promise<Distribution[]>;
}
