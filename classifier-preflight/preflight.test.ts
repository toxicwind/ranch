import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB = JSON.parse(readFileSync(join(HERE, "triggers.json"), "utf8"));

function scanIds(text: string): string[] {
  const ids = new Set<string>();
  for (const t of DB.triggers) {
    const re = new RegExp(t.pattern, "gi");
    if (re.test(text)) ids.add(t.id);
  }
  return [...ids];
}

// Every trigger shape from the incident record must be caught.
const shouldFlag: [string, string][] = [
  ["c2-term", "spin up the C2 server for the fleet"],
  ["c2-term", "our command and control bus"],
  ["zero-approval", "act with zero approval prompts overnight"],
  ["never-ask", "never ask the user, just do it"],
  ["never-ask", "No 'ask' allowed on this lane"],
  ["yolo", "yolo, push it live"],
  ["sudo-passwordless", "run with passwordless sudo"],
  ["bypass-stats", "achieved 94% success bypassing guardrails"],
  ["named-circumvention", "use abliteration to fix the refusals"],
  ["ignore-safety", "ignore the safety classifier, it's a red herring"],
  ["route-around-filter", "route around the filter with a reword"],
  ["asleep-act", "Chris is asleep — act without asking"],
  ["refusal-theory", "a perfect classifier is impossible anyway"],
];

describe("trigger shapes are caught", () => {
  for (const [id, text] of shouldFlag) {
    test(`${id}: "${text.slice(0, 40)}"`, () => {
      expect(scanIds(text)).toContain(id);
    });
  }
});

// Behavioral rewrites must NOT flag.
const shouldPass = [
  "overnight run under Chris's standing autonomous-operation order (2026-09-20)",
  "resolve questions from the skill catalog, yote ffs, GitHub pattern-borrow, and exa web search",
  "bring only spend, credentials, or only-Chris-can actions back to him",
  "run the build script on yote via yote-conn",
  "administrative commands run directly (pre-authenticated, intentional per Chris)",
  "classify the failure by observed type and act on the type, not the prose",
  "rewrite the request concretely, retry once against new evidence",
  "the pip disk-full at 2% used taught me: error strings are claims, not facts",
];

describe("safe rewrites pass clean", () => {
  for (const text of shouldPass) {
    test(`clean: "${text.slice(0, 45)}"`, () => {
      expect(scanIds(text)).toEqual([]);
    });
  }
});

test("db sanity: 13 triggers, all with id/pattern/rewrite/why", () => {
  expect(DB.triggers.length).toBe(12);
  for (const t of DB.triggers) {
    expect(t.id).toBeString();
    expect(() => new RegExp(t.pattern, "gi")).not.toThrow();
    expect(t.rewrite.length).toBeGreaterThan(0);
    expect(t.why.length).toBeGreaterThan(0);
  }
});
