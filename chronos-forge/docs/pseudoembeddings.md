# Pseudoembeddings

Short tokens that stand in for large bodies of evidence, with deterministic
retrieval. They are **pointers, not memories** — the model never "remembers"
a chunk's contents; it re-reads them.

## Mechanism

1. Any large text, log, or file body is compressed and stored as a chunk.
2. The chunk id is content-derived: `pe_<sha256_16>`.
3. In all subsequent reasoning, refer to the body by its token: `⟦PE:pe_<sha256_16>⟧`.
4. Retrieval is `ChunkStore.retrieve(id)` — a deterministic decode, never a guess.

## Guarantees

- **Idempotent.** `store.put(x)` twice produces one chunk. Identical bytes
  always land at the same key.
- **Content-addressable.** The id *is* the hash of the bytes, so a re-emitted
  chunk cannot silently drift.
- **Integrity-checked on retrieval.** `retrieveChunk` recomputes the hash and
  throws on mismatch. A tampered or corrupt gzip payload surfaces as a stable
  `chunk integrity failure` error rather than an opaque zlib message.
- **Dangling pointers are loud.** Retrieving an unknown id throws
  `dangling pointer` instead of returning empty.

## Usage

```ts
import { ChunkStore, peToken } from './chronos/pseudoembedding.js';

const store = new ChunkStore();
const chunk = store.put(hugeLogOutput);

// Emit the pointer, not the payload.
console.log(`evidence: ${peToken(chunk.chunkId)}`);

// Later: deterministic retrieval.
const body = store.retrieve(chunk.chunkId).toString('utf8');
```

## Why not vector embeddings

A real embedding compresses; a pseudoembedding *references*. Compression loses
information, which is unacceptable for a proof gate that must cite a verbatim
excerpt. The token is cheap to carry in context and exact to retrieve.
