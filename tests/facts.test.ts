/**
 * facts.test.ts — the README facts block must always match the code.
 *
 * Mirrors codegen.test.ts: regenerate the FACTS block into a temp dir and
 * diff byte-for-byte against README.md. A stale block (provider added,
 * alias changed, dead id, test added — but README not regenerated) FAILS
 * this suite, exactly like a stale generated/ artifact does.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { syncFacts, buildFactsBlock } from "../scripts/gen-facts.ts";

const here = dirname(fileURLToPath(import.meta.url));
const readme = join(here, "..", "README.md");

describe("README facts block", () => {
  test("checked-in FACTS block matches a fresh generation (run `bun run facts`)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pinax-facts-"));
    try {
      // Copy README into a temp dir and let syncFacts rewrite it there.
      const tmpReadme = join(dir, "README.md");
      await writeFile(tmpReadme, await readFile(readme, "utf8"), "utf8");
      syncFacts(tmpReadme);
      const fresh = await readFile(tmpReadme, "utf8");
      const checkedIn = await readFile(readme, "utf8");
      expect(
        fresh,
        "README.md FACTS block is stale — run `bun run facts` (or `bun run build`)",
      ).toBe(checkedIn);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("block is deterministic and self-consistent", () => {
    const a = buildFactsBlock();
    const b = buildFactsBlock();
    expect(a).toBe(b);
    // The block must actually report at least one provider and carry markers.
    expect(a).toContain("<!-- FACTS:START -->");
    expect(a).toContain("| provider defs |");
    expect(a).toMatch(/\| provider defs \| \d+ \|/);
  });
});