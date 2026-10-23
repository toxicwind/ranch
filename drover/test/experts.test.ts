import { describe, it, expect } from 'bun:test';
import { ExpertEngine, EXPERT_PROFILES } from '../src/experts/profiles';
import { ModelRegistry } from '../src/models/registry';

describe('Expert Profiles & Engine', () => {
  const registry = new ModelRegistry();
  const engine = new ExpertEngine(registry);

  it('should find expert profiles by id', () => {
    const p = engine.getProfile('coding');
    expect(p).toBeDefined();
    expect(p?.label).toContain('Coding');

    const invalid = engine.getProfile('non-existent');
    expect(invalid).toBeUndefined();
  });

  it('should auto-detect expert profile based on prompt keywords', () => {
    const secProfile = engine.detectProfile('Please review this exploit and buffer overflow vulnerability');
    expect(secProfile.id).toBe('security');

    const codingProfile = engine.detectProfile('How do I refactor this typescript class?');
    expect(codingProfile.id).toBe('coding');

    const eduProfile = engine.detectProfile('Teach me and explain how AST works eli5');
    expect(eduProfile.id).toBe('learning');

    const genProfile = engine.detectProfile('What is today weather?');
    expect(genProfile.id).toBe('general');
  });

  it('should recommend models scored against profile weights', () => {
    const recs = engine.recommend('coding', 2);
    expect(recs.length).toBe(2);
    expect(recs[0].rank).toBe(1);
    expect(recs[0].score).toBeGreaterThan(0);
    expect(recs[0].reason).toContain('Coding');
    expect(recs[1].rank).toBe(2);
  });
});
