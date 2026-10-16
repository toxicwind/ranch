import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BudgetExceededError,
  DEFAULT_BUDGET_MS,
  boundedCommand,
  clampBudget,
  withBudget,
} from '../dist/chronos/timeout.js';

test('DEFAULT_BUDGET_MS is 2000', () => {
  assert.equal(DEFAULT_BUDGET_MS, 2000);
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
