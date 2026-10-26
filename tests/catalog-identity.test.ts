/**
 * catalog-identity.test.ts — the catalog must register ONE identity per
 * service, and must not drift from the estate's live ports.
 *
 * Why this test exists (2026-10-25): the catalog carried `omniroute`
 * (a port that died when the service was renamed to hodos), omitted the
 * LIVE local engine at :25100 entirely, and nested a `flock` modelProvider
 * pointing at its own parent's URL. Nothing caught any of it: the catalog
 * compiled, the generated artifacts synced, and every test passed while the
 * catalog described an estate that no longer existed.
 *
 * This is the same drift-killer pattern codegen.test.ts uses for `generated/`:
 * the facts are derived from the module itself, so they cannot go stale.
 */
import { describe, expect, test } from "bun:test";
import { PROVIDER_DEFS, MODEL_ALIASES, DEAD_MODEL_IDS } from "../src/data.ts";

/** Every registered identity — top-level providers plus their modelProviders. */
function registeredIdentities(): { name: string; baseUrl: string; parent?: string }[] {
  const out: { name: string; baseUrl: string; parent?: string }[] = [];
  for (const d of PROVIDER_DEFS) {
    out.push({ name: d.name, baseUrl: d.baseUrl ?? "" });
    for (const mp of d.modelProviders ?? []) {
      out.push({ name: mp.name, baseUrl: mp.baseUrl, parent: d.name });
    }
  }
  return out;
}

describe("catalog identity — one service, one identity", () => {
  test("no two TOP-LEVEL providers share a baseUrl", () => {
    const byUrl = new Map<string, string[]>();
    for (const d of PROVIDER_DEFS) {
      const url = d.baseUrl ?? "";
      if (!url) continue;
      const list = byUrl.get(url) ?? [];
      list.push(d.name);
      byUrl.set(url, list);
    }
    const collisions = [...byUrl.entries()].filter(([, names]) => names.length > 1);
    expect(
      collisions.map(([url, names]) => `${url} -> ${names.join(", ")}`),
    ).toEqual([]);
  });

  test("no modelProvider duplicates its own parent's baseUrl", () => {
    const selfReferential: string[] = [];
    for (const d of PROVIDER_DEFS) {
      for (const mp of d.modelProviders ?? []) {
        if (mp.baseUrl === d.baseUrl) {
          selfReferential.push(`${d.name}.${mp.name} == ${d.name} (${mp.baseUrl})`);
        }
      }
    }
    expect(selfReferential).toEqual([]);
  });

  test("no registered identity points at a dead estate port", () => {
    // The estate's live local services. A catalog entry pointing at a port
    // outside this set is either a stale alias or a service that died.
    const LIVE_LOCAL_PORTS = new Set([":25100", ":25109", ":25153", ":25193", ":25200"]);
    const stale: string[] = [];
    for (const id of registeredIdentities()) {
      if (!id.baseUrl.includes("127.0.0.1")) continue;
      const m = id.baseUrl.match(/:(\d{4,5})/);
      if (!m) continue;
      if (!LIVE_LOCAL_PORTS.has(`:${m[1]}`)) {
        stale.push(`${id.name} -> ${id.baseUrl}`);
      }
    }
    expect(stale).toEqual([]);
  });

  test("retired aliases are gone", () => {
    const names = new Set(registeredIdentities().map((i) => i.name));
    // `omniroute` died when the service was renamed to hodos (:20130).
    // `flock` was a nested duplicate of hodos' own URL.
    expect(names.has("omniroute")).toBe(false);
    expect(names.has("flock")).toBe(false);
  });

  test("the live local engine IS registered", () => {
    // :25100 is the local VRAM engine. It was absent from the catalog while
    // running and serving models — the estate's own local models were
    // invisible to every catalog consumer.
    const bornite = PROVIDER_DEFS.find((d) => d.name === "bornite");
    expect(bornite).toBeDefined();
    expect(bornite?.baseUrl).toBe("http://127.0.0.1:25100/v1");
  });

  test("the EAP bridge keeps pointing at the keypool, not at the engine", () => {
    // :25109 is the keypool wire bridge. The engine behind it is the
    // private `@estate/theta` package — a library, never a catalog entry.
    const google = PROVIDER_DEFS.find((d) => d.name === "google");
    expect(google?.baseUrl).toBe("http://127.0.0.1:25109/gemini-eap-interactions");
    expect(PROVIDER_DEFS.some((d) => d.name === "theta")).toBe(false);
    expect(PROVIDER_DEFS.some((d) => d.name === "danburite")).toBe(false);
  });
});

describe("catalog shape", () => {
  test("provider count is non-trivial", () => {
    expect(PROVIDER_DEFS.length).toBeGreaterThan(30);
  });

  test("every provider has an adapter and a baseUrl", () => {
    for (const d of PROVIDER_DEFS) {
      expect(d.adapter).toBeTruthy();
      expect(d.baseUrl).toBeTruthy();
    }
  });

  test("aliases and dead ids are well-formed", () => {
    for (const [alias, pair] of Object.entries(MODEL_ALIASES)) {
      expect(alias).toBeTruthy();
      expect(Array.isArray(pair)).toBe(true);
      expect(pair.length).toBe(2);
    }
    for (const id of DEAD_MODEL_IDS) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });
});
