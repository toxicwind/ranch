import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLine, frame, parseFrame, EventBus, FRAME_PATTERN } from '../dist/chronos/event-frame.js';

const ctx = {
  repoHash: 'a1b2c3d4e5',
  agentId: 'deadbeef',
  role: 'COORD' as const,
  runId: 'run_20261015',
  cycle: 1,
};

test('formatLine zero-pads to 6 digits', () => {
  assert.equal(formatLine(1), 'L000001');
  assert.equal(formatLine(999999), 'L999999');
  assert.equal(formatLine(1234567), 'L1234567');
});

test('frame produces the exact transport shape', () => {
  const line = frame(ctx, 1, 'PROOF', { type: 'proof', argv: ['true'], rc: 0 });
  assert.match(
    line,
    /^\[CHR\|a1b2c3d4e5\|deadbeef\|COORD\|run_20261015\|1\|PROOF\|L000001\] \{.*\}$/,
  );
});

test('parseFrame round-trips', () => {
  const line = frame(ctx, 42, 'OPERATE', { type: 'cmd', argv: ['ls'], rc: 0, ms: 12 });
  const parsed = parseFrame(line);
  assert.ok(parsed);
  assert.equal(parsed.frame.repoHash, 'a1b2c3d4e5');
  assert.equal(parsed.frame.cycle, 1);
  assert.equal(parsed.line, 42);
  assert.equal(parsed.event.type, 'cmd');
});

test('parseFrame rejects non-event lines', () => {
  assert.equal(parseFrame('just some log noise'), null);
  assert.equal(parseFrame(''), null);
  // truncated JSON must not throw
  assert.equal(parseFrame('[CHR|a|b|COORD|r|1|PROOF|L000001] {"type":'), null);
});

test('EventBus emits monotonically increasing line numbers', () => {
  const captured: string[] = [];
  const bus = new EventBus(ctx, (l) => captured.push(l));
  bus.emit('OPERATE', { type: 'stdout' });
  bus.emit('OPERATE', { type: 'stdout' });
  bus.emit('OPERATE', { type: 'stdout' });
  assert.equal(bus.line, 3);
  assert.match(captured[0], /L000001\]/);
  assert.match(captured[1], /L000002\]/);
  assert.match(captured[2], /L000003\]/);
});

test('FRAME_PATTERN accepts a well-formed line', () => {
  assert.ok(FRAME_PATTERN.test('[CHR|h|a|COORD|r|7|PROOF|L000123] {"type":"proof"}'));
});
