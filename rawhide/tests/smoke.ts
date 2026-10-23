import { lintFile, loadPacks } from "../src/engine.js";

async function main() {
  const sample = `This approach may potentially leverage the paradigm to unlock value.

Utilize the tool in order to commence the process.

This is a short sentence.

A very long sentence that goes on and on with many words just to exceed the seventy five word limit so that the dense prose rule fires and we can verify the collector works correctly on markdown aware text without code blocks interfering.`;
  const packs = await loadPacks(["gwern", "airspeak"]);
  const issues = await lintFile("test.md", sample, packs);
  console.log(JSON.stringify({ count: issues.length, issues }, null, 2));
}

main().catch(console.error);
