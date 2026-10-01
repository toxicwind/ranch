import { describe, expect, test } from "bun:test";
import { scoreSkill, callTool, handleRequest, type Skill } from "./server";

// Injected catalog — keeps the tests off the real filesystem.
const skills: Skill[] = [
  { name: "fleet-spawn", description: "spawn agents into the fleet", path: "/tmp/sb-test/fleet-spawn/SKILL.md" },
  { name: "paper-search", description: "search arXiv papers", path: "/tmp/sb-test/paper-search/SKILL.md" },
  { name: "classifier-doctor", description: "diagnose classifier failures", path: "/tmp/sb-test/classifier-doctor/SKILL.md" },
];

describe("scoreSkill", () => {
  test("name match outranks non-match", () => {
    expect(scoreSkill("spawn", skills[0])).toBeGreaterThan(scoreSkill("spawn", skills[2]));
  });
  test("no token overlap scores zero", () => {
    expect(scoreSkill("xyzzy", skills[0])).toBe(0);
  });
  test("description-only match scores below name match", () => {
    // "agents" appears in fleet-spawn's description only, not its name.
    const descOnly = scoreSkill("agents", skills[0]);
    expect(descOnly).toBeGreaterThan(0);
    expect(scoreSkill("fleet", skills[0])).toBeGreaterThan(descOnly);
  });
});

describe("callTool", () => {
  test("skill_search ranks the best match first", async () => {
    const out = await callTool("skill_search", { query: "fleet spawn" }, skills);
    expect(out.count).toBeGreaterThan(0);
    expect(out.skills[0].name).toBe("fleet-spawn");
  });
  test("skill_search with no overlap returns empty", async () => {
    const out = await callTool("skill_search", { query: "xyzzy" }, skills);
    expect(out.count).toBe(0);
    expect(out.skills).toEqual([]);
  });
  test("skill_get throws for an unknown skill", async () => {
    await expect(callTool("skill_get", { name: "nope" }, skills)).rejects.toThrow("skill not found");
  });
  test("unknown tool throws", async () => {
    await expect(callTool("nope", {}, skills)).rejects.toThrow("unknown tool");
  });
});

describe("handleRequest", () => {
  test("initialize returns the protocol version", async () => {
    const r = await handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }, skills);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.serverInfo.name).toBe("switchboard");
  });
  test("tools/list returns the tool catalog", async () => {
    const r = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }, skills);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const names = r.result.tools.map((t: { name: string }) => t.name);
      expect(names).toContain("skill_search");
      expect(names).toContain("skill_get");
    }
  });
  test("tools/call skill_search round-trips through JSON-RPC", async () => {
    const r = await handleRequest(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "skill_search", arguments: { query: "paper" } } },
      skills,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const payload = JSON.parse(r.result.content[0].text);
      expect(payload.skills[0].name).toBe("paper-search");
    }
  });
  test("unknown method returns an error, not a throw", async () => {
    const r = await handleRequest({ jsonrpc: "2.0", id: 4, method: "bogus/method" }, skills);
    expect(r.ok).toBe(false);
  });
});
