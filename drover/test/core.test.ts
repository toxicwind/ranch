import { describe, it, expect } from 'bun:test';
import { createDroverCore } from '../src/index';

describe('Drover Core Integration', () => {
  it('should instantiate complete integrated drover system', () => {
    const drover = createDroverCore();
    expect(drover.registry).toBeDefined();
    expect(drover.experts).toBeDefined();
    expect(drover.providers.length).toBe(5);
    expect(drover.router).toBeDefined();
    expect(drover.acp).toBeDefined();

    const recs = drover.experts.recommend('coding', 1);
    expect(recs.length).toBe(1);
    expect(recs[0].model.id).toBeDefined();
  });
});
