import {Pipeline} from '../src/pipeline';
import {ClassPartition} from '../src/analysis/classPartition';

describe('Pipeline', () => {
  it('runs', async () => {
    const pipeline = new Pipeline([new ClassPartition()]);

    pipeline.execute();
  });
});
