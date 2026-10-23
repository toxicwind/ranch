import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../dist/chronos/event-frame.js';

test('EventBus frames with the cycle in progress, not the construction cycle', () => {
  const captured: string[] = [];
  const state = { cycle: 0 };
  const bus = new EventBus(
    { repoHash: 'h', agentId: 'a', role: 'COORD', runId: 'r', cycle: 0 },
    (l) => captured.push(l),
    () => state.cycle,
  );

  state.cycle = 1;
  bus.emit('PROOF', { type: 'proof' });
  assert.match(captured[0], /\|1\|PROOF\|L000001\]/);

  state.cycle = 2;
  bus.emit('CHECKPOINT', { type: 'checkpoint' });
  assert.match(captured[1], /\|2\|CHECKPOINT\|L000002\]/);
});

test('EventBus defaults to the context cycle when no provider is given', () => {
  const captured: string[] = [];
  const bus = new EventBus(
    { repoHash: 'h', agentId: 'a', role: 'COORD', runId: 'r', cycle: 7 },
    (l) => captured.push(l),
  );
  bus.emit('PROOF', { type: 'proof' });
  assert.match(captured[0], /\|7\|PROOF\|L000001\]/);
});
