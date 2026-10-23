import { describe, it, expect } from 'bun:test';
import { ModelRegistry, CATALOG, ModelDefinition } from '../src/models/registry';

describe('ModelRegistry', () => {
  it('should initialize with default CATALOG', () => {
    const reg = new ModelRegistry();
    expect(reg.getAll().length).toBe(CATALOG.length);
    expect(reg.getAvailable().length).toBeGreaterThan(0);
  });

  it('should retrieve model by provider and id', () => {
    const reg = new ModelRegistry();
    const model = reg.getById('nvidia', 'deepseek-ai/deepseek-r1');
    expect(model).toBeDefined();
    expect(model?.displayName).toContain('DeepSeek R1');
  });

  it('should register a new model dynamically', () => {
    const reg = new ModelRegistry([]);
    expect(reg.getAll().length).toBe(0);

    const custom: ModelDefinition = {
      id: 'custom-model',
      provider: 'custom',
      displayName: 'Custom Model',
      contextLength: 4096,
      capabilities: { speed: 10 },
      description: 'Test model',
      available: true
    };
    reg.register(custom);

    expect(reg.getAll().length).toBe(1);
    expect(reg.getById('custom', 'custom-model')).toBeDefined();
  });

  it('should toggle availability of models', () => {
    const reg = new ModelRegistry();
    reg.setAvailability('nvidia', 'deepseek-ai/deepseek-r1', false);
    const m = reg.getById('nvidia', 'deepseek-ai/deepseek-r1');
    expect(m?.available).toBe(false);

    const available = reg.getAvailable();
    expect(available.find(x => x.id === 'deepseek-ai/deepseek-r1')).toBeUndefined();

    reg.setAvailability('nvidia', 'deepseek-ai/deepseek-r1', true);
    expect(reg.getById('nvidia', 'deepseek-ai/deepseek-r1')?.available).toBe(true);
  });

  it('should safely return empty lastErrors initially', () => {
    const reg = new ModelRegistry();
    expect(reg.getLastErrors()).toEqual([]);
  });
});
