import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BudgetExceededError,
  DEFAULT_BUDGET_MS,
  MODEL_BUDGET_MS,
  boundedCommand,
  clampBudget,
  modelBudget,
  modelIsKnownBroken,
  withBudget,
} from '../dist/chronos/timeout.js';

test('DEFAULT_BUDGET_MS is 2000', () => {
  assert.equal(DEFAULT_BUDGET_MS, 2000);
});

test('fast models keep the default 2s budget', () => {
  assert.equal(modelBudget('stepfun-ai/step-5-preview'), 2000);
  assert.equal(modelBudget('nvidia/nemotron-3.5-super-vl-120b-a12b'), 2000);
});

test('slow models get measured latency headroom', () => {
  assert.equal(modelBudget('z-ai/glm-5.3-flash'), 45000);
  assert.equal(modelBudget('nvidia/nemotron-3.5-lightning-30b-a3b'), 60000);
  assert.equal(modelBudget('z-ai/glm-5.3'), 12000);
  assert.equal(modelBudget('meta/muse-glimmer-30b'), 12000);
});

test('unknown models fall back to the default', () => {
  assert.equal(modelBudget('totally/unknown-model'), DEFAULT_BUDGET_MS);
  assert.equal(modelBudget(undefined), DEFAULT_BUDGET_MS);
});

test('known-broken models have a 0 budget', () => {
  assert.equal(modelBudget('nvidia/nemotron-3-ultra-550b-a55b'), 0);
  assert.equal(modelBudget('deepseek-ai/deepseek-v4.1-flash'), 0);
  assert.equal(modelIsKnownBroken('nvidia/nemotron-3-ultra-550b-a55b'), true);
  assert.equal(modelIsKnownBroken('deepseek-ai/deepseek-v4.1-flash'), true);
  assert.equal(modelIsKnownBroken('stepfun-ai/step-5-preview'), false);
  assert.equal(modelIsKnownBroken(undefined), false);
});

test('every MODEL_BUDGET_MS entry is a non-negative number', () => {
  for (const [model, budget] of Object.entries(MODEL_BUDGET_MS)) {
    assert.equal(typeof budget, 'number', `${model} budget type`);
    assert.ok(budget >= 0, `${model} budget non-negative`);
  }
});

test('clampBudget honors a larger model-derived ceiling', () => {
  // glm-5.3-flash ceiling is 45s: an explicit 10s request must survive.
  assert.equal(clampBudget(10000, modelBudget('z-ai/glm-5.3-flash')), 10000);
});


test('boundedCommand returns rc and stdout for a fast command', () => {
  const r = boundedCommand('echo hello-chronos', { budgetMs: 5000 });
  assert.equal(r.rc, 0);
  assert.match(r.stdout, /hello-chronos/);
  assert.equal(r.timedOut, false);
  assert.ok(r.ms < 5000);
});

test('boundedCommand caps a hanging command', () => {
  // Sleep well past the budget; the cap must end it, not the command.
  const r = boundedCommand(process.platform === 'win32' ? 'ping -n 30 127.0.0.1' : 'sleep 30', {
    budgetMs: 500,
  });
  assert.equal(r.timedOut, true);
  assert.ok(r.ms < 5000, `should finish near the budget, took ${r.ms}ms`);
});

test('boundedCommand reports nonzero rc for a failing command', () => {
  const r = boundedCommand(process.platform === 'win32' ? 'exit /b 3' : 'exit 3', {
    budgetMs: 5000,
  });
  assert.notEqual(r.rc, 0);
});

test('clampBudget defaults to the ceiling', () => {
  assert.equal(clampBudget(undefined), DEFAULT_BUDGET_MS);
  assert.equal(clampBudget(0), DEFAULT_BUDGET_MS);
  assert.equal(clampBudget(-5), DEFAULT_BUDGET_MS);
});

test('clampBudget never exceeds the ceiling', () => {
  assert.equal(clampBudget(999999), DEFAULT_BUDGET_MS);
  assert.equal(clampBudget(1000), 1000);
});

test('withBudget resolves fast work', async () => {
  const v = await withBudget(() => 'quick', 2000, 'fast-op');
  assert.equal(v, 'quick');
});

test('withBudget rejects when the budget is blown', async () => {
  await assert.rejects(
    () =>
      withBudget(
        () => new Promise((resolve) => setTimeout(resolve, 10_000)),
        100,
        'slow-op',
      ),
    BudgetExceededError,
  );
});
