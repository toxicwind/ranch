import { describe, expect, test } from "bun:test";
import { PROVIDER_DEFS } from "../src/data.ts";
import type { AdapterId, AuthStyle } from "../src/types.ts";

const ADAPTERS: AdapterId[] = ["openai", "google-v1beta", "mistral", "static", "none"];
const AUTHS: AuthStyle[] = ["bearer", "x-api-key", "query-key", "none"];

describe("provider wire data integrity", () => {
  test("every definition has a valid adapter and auth style", () => {
    for (const d of PROVIDER_DEFS) {
      expect(ADAPTERS).toContain(d.adapter);
      if (d.auth !== undefined) expect(AUTHS).toContain(d.auth);
    }
  });

  test("every http(s) baseUrl is well-formed", () => {
    for (const d of PROVIDER_DEFS) {
      if (d.baseUrl.startsWith("http")) {
        expect(() => new URL(d.baseUrl)).not.toThrow();
      }
    }
  });

  test("x-api-key definitions declare a header name", () => {
    for (const d of PROVIDER_DEFS) {
      if (d.auth === "x-api-key") {
        expect(d.headerName, `${d.name} missing headerName`).toBeTruthy();
      }
    }
  });

  test("keyEnv is set and looks like an env var name", () => {
    for (const d of PROVIDER_DEFS) {
      expect(d.keyEnv, `${d.name} missing keyEnv`).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  test("anthropic uses x-api-key auth against its native models endpoint", () => {
    const a = PROVIDER_DEFS.find((d) => d.name === "anthropic")!;
    expect(a.baseUrl).toBe("https://api.anthropic.com/v1");
    expect(a.auth).toBe("x-api-key");
    expect(a.headerName).toBe("x-api-key");
  });

  test("templated baseUrls preserve their region/account placeholders", () => {
    const mantle = PROVIDER_DEFS.find((d) => d.name === "bedrock-mantle")!;
    expect(mantle.baseUrl).toContain("{region}");
    const cf = PROVIDER_DEFS.find((d) => d.name === "cloudflare-ai-gateway")!;
    expect(cf.baseUrl).toContain("<account>");
  });
});
