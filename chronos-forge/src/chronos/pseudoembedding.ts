/**
 * Pseudoembeddings — live pointers that act "real".
 *
 * Any large text/log/file body is stored as a chunk and referenced by a short
 * token. The token is a *pointer*, not a memory: retrieval is deterministic
 * (re-read the chunk), never "remembered".
 *
 *   chunk_id = pe_<sha256_16>
 *   token    = ⟦PE:pe_<sha256_16>⟧
 */

import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export const CHUNK_PREFIX = 'pe_';

export interface Chunk {
  chunkId: string;
  encoding: 'gzip+base64';
  bytes: number;
  dataB64: string;
}

export function chunkIdFor(content: string | Buffer): string {
  const h = createHash('sha256');
  h.update(typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
  return CHUNK_PREFIX + h.digest('hex').slice(0, 16);
}

/** Content-addressable: identical bytes always yield the identical chunk id. */
export function makeChunk(content: string | Buffer): Chunk {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return {
    chunkId: chunkIdFor(buf),
    encoding: 'gzip+base64',
    bytes: buf.length,
    dataB64: gzipSync(buf).toString('base64'),
  };
}

/** Inverse of {@link makeChunk}. Throws if the stored bytes do not match the id. */
export function retrieveChunk(chunk: Chunk): Buffer {
  if (chunk.encoding !== 'gzip+base64') {
    throw new Error(`unsupported chunk encoding: ${chunk.encoding}`);
  }
  let raw: Buffer;
  try {
    raw = gunzipSync(Buffer.from(chunk.dataB64, 'base64'));
  } catch {
    // Corrupt or tampered payload. Surface it as an integrity failure so the
    // caller sees a stable, actionable error instead of a raw zlib message.
    throw new Error(`chunk integrity failure: ${chunk.chunkId} (payload is not valid gzip+base64)`);
  }
  const actual = chunkIdFor(raw);
  if (actual !== chunk.chunkId) {
    throw new Error(`chunk integrity failure: id=${chunk.chunkId} recomputed=${actual}`);
  }
  return raw;
}

export function peToken(chunkId: string): string {
  return `⟦PE:${chunkId}⟧`;
}

export const PE_TOKEN_PATTERN = /⟦PE:(pe_[0-9a-f]{16})⟧/g;

/** Every pointer mentioned in a body of text. */
export function extractTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PE_TOKEN_PATTERN)) out.push(m[1]);
  return out;
}

/**
 * In-memory chunk store. Deterministic and addressable — the same content
 * always lands at the same key, so a re-emitted chunk is idempotent.
 */
export class ChunkStore {
  private readonly chunks = new Map<string, Chunk>();

  put(content: string | Buffer): Chunk {
    const chunk = makeChunk(content);
    this.chunks.set(chunk.chunkId, chunk);
    return chunk;
  }

  get(chunkId: string): Chunk | undefined {
    return this.chunks.get(chunkId);
  }

  /** Retrieve decoded bytes, or throw if the pointer is dangling. */
  retrieve(chunkId: string): Buffer {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) throw new Error(`dangling pointer: ${chunkId}`);
    return retrieveChunk(chunk);
  }

  /** Resolve every pointer found in `text` to decoded bodies. */
  resolve(text: string): Array<{ chunkId: string; body: Buffer }> {
    return extractTokens(text).map((chunkId) => ({ chunkId, body: this.retrieve(chunkId) }));
  }

  get size(): number {
    return this.chunks.size;
  }
}
