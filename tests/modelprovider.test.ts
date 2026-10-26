// @pinax — provider -> modelProvider -> model hierarchy (TDD contract).
// A provider may own 1..N modelProviders (distinct serving backends). The SAME
// model id in two modelProviders is a VALID dupe — never deduped, tagged by
// modelProvider path. Legacy providers without modelProviders (flat) are
// unchanged and resolve at modelProvider = "".

import { describe, expect, test } from "bun:test";
import { ModelCatalog } from "../src/catalog.ts";
import type { ProviderDef } from "../src/types.ts";

// Hermetic fixtures: a hierarchical "hodos" provider with two modelProviders
// (flock :25193, secure-NIM) serving an overlapping model; a "freeinference"
// flat provider (legacy).
const FIXTURES: ProviderDef[] = [
  {
    name: "hodos",
    adapter: "none",
    baseUrl: "http://127.0.0.1:25193/v1",
    keyEnv: "HODOS_API_KEY",
    seeds: [],
    modelProviders: [
      {
        name: "flock",
        baseUrl: "http://127.0.0.1:25193/v1",
        keyEnv: "HODOS_API_KEY",
        adapter: "openai",
        seeds: [
          "nvidia/nemotron-3.5-super-vl-120b-a12b",
          "meta/llama-3.2-11b-vision-instruct",
        ],
      },
      {
        name: "secure-nim",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        keyEnv: "NVIDIA_API_KEY",
        adapter: "openai",
        seeds: [
          "nvidia/nemotron-3.5-super-vl-120b-a12b",
          "nvidia/nemotron-3.5-lightning-30b-a3b",
        ],
      },
    ],
  },
  {
    name: "freeinference",
    adapter: "openai",
    baseUrl: "https://freeinference.org/v1",
    keyEnv: "FREEINFERENCE_API_KEY",
    seeds: ["qwen3.6-35b", "glm-5.3-flash"],
  },
];

const catalog = new ModelCatalog(FIXTURES);

describe("provider -> modelProvider -> model", () => {
  test("(a) hierarchical provider resolves its modelProviders each with their own models", () => {
    const rows = catalog.allServingByModelProvider();
    const hodos = rows.filter((r) => r.provider === "hodos");
    const flock = hodos
      .filter((r) => r.modelProvider === "flock")
      .map((r) => r.id);
    expect(flock).toContain("nvidia/nemotron-3.5-super-vl-120b-a12b");
    expect(flock).toContain("meta/llama-3.2-11b-vision-instruct");
    const secure = hodos
      .filter((r) => r.modelProvider === "secure-nim")
      .map((r) => r.id);
    expect(secure).toContain("nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(new Set(hodos.map((r) => r.modelProvider))).toEqual(
      new Set(["flock", "secure-nim"]),
    );
  });

  test("(b) the SAME model in two modelProviders is a VALID dupe – not deduped, both tagged", () => {
    const rows = catalog.allServingByModelProvider();
    const dupe = rows.filter(
      (r) =>
        r.provider === "hodos" &&
        r.id === "nvidia/nemotron-3.5-super-vl-120b-a12b",
    );
    // two distinct provider/modelProvider rows, same id, NOT merged
    expect(dupe).toHaveLength(2);
    expect(new Set(dupe.map((r) => r.modelProvider))).toEqual(
      new Set(["flock", "secure-nim"]),
    );
  });

  test("(c) legacy provider without modelProviders resolves flat at modelProvider = ''", () => {
    const rows = catalog.allServingByModelProvider();
    const fi = rows.filter((r) => r.provider === "freeinference");
    expect(fi.length).toBeGreaterThanOrEqual(2);
    for (const r of fi) expect(r.modelProvider).toBe("");
    expect(new Set(fi.map((r) => r.id))).toEqual(
      new Set(["qwen3.6-35b", "glm-5.3-flash"]),
    );
  });

  test("(c2) legacy flat allServing() unchanged (no modelProvider field) for flat providers", () => {
    const flat = catalog
      .allServing()
      .filter((r) => r.provider === "freeinference")
      .map((r) => r.id);
    expect(new Set(flat)).toEqual(new Set(["qwen3.6-35b", "glm-5.3-flash"]));
  });
});
