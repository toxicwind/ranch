import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ChunkStore,
  chunkIdFor,
  extractTokens,
  makeChunk,
  peToken,
  retrieveChunk,
} from '../dist/chronos/pseudoembedding.js';

test('chunkIdFor is deterministic and content-addressable', () => {
  const a = chunkIdFor('hello chronos');
  const b = chunkIdFor('hello chronos');
  assert.equal(a, b);
  assert.match(a, /^pe_[0-9a-f]{16}$/);
  assert.notEqual(a, chunkIdFor('hello chrono'));
});

test('gzip+base64 round-trip is lossless', () => {
  const body = 'CHRONOS-FORGE proof payload\nline two\n';
  const chunk = makeChunk(body);
  const back = retrieveChunk(chunk);
  assert.equal(back.toString('utf8'), body);
});

test('retrieveChunk detects tampering', () => {
  const chunk = makeChunk('original');
  const tampered = { ...chunk, dataB64: Buffer.from('tampered').toString('base64') };
  assert.throws(() => retrieveChunk(tampered), /integrity failure/);
});

test('peToken wraps the id', () => {
  assert.equal(peToken('pe_abc'), '⟦PE:pe_abc⟧');
});

test('extractTokens finds every pointer in text', () => {
  const t1 = peToken('pe_1111111111111111');
  const t2 = peToken('pe_2222222222222222');
  assert.deepEqual(extractTokens(`see ${t1} and also ${t2}`), [
    'pe_1111111111111111',
    'pe_2222222222222222',
  ]);
  assert.deepEqual(extractTokens('no pointers here'), []);
});

test('ChunkStore.put is idempotent for identical content', () => {
  const store = new ChunkStore();
  const a = store.put('same body');
  const b = store.put('same body');
  assert.equal(a.chunkId, b.chunkId);
  assert.equal(store.size, 1);
});

test('ChunkStore.retrieve returns decoded bytes', () => {
  const store = new ChunkStore();
  const chunk = store.put('payload body');
  assert.equal(store.retrieve(chunk.chunkId).toString('utf8'), 'payload body');
});

test('ChunkStore throws on a dangling pointer', () => {
  const store = new ChunkStore();
  assert.throws(() => store.retrieve('pe_0000000000000000'), /dangling pointer/);
});

test('ChunkStore.resolve maps text pointers to bodies', () => {
  const store = new ChunkStore();
  const c = store.put('resolved body');
  const text = `evidence: ${peToken(c.chunkId)}`;
  const resolved = store.resolve(text);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].body.toString('utf8'), 'resolved body');
});
