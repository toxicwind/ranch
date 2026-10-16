import { describe, it, expect } from "bun:test";
import { loadConfig, isConfigured } from "../src/index";

describe("integration: estate config", () => {
  it("loads real environment config", () => {
    const cfg = loadConfig();
    // Should not throw; may be empty in CI but should be structurally valid
    expect(typeof cfg.nimApiKey).toBe("string");
    expect(typeof cfg.brevoApiKey).toBe("string");
    expect(typeof cfg.brevoOrgId).toBe("string");
    expect(typeof cfg.nimBaseUrl).toBe("string");
  });

  it("reports configuration status", () => {
    const cfg = loadConfig();
    const configured = isConfigured(cfg);
    expect(typeof configured).toBe("boolean");
    if (configured) {
      expect(cfg.nimApiKey.length).toBeGreaterThan(0);
      expect(cfg.brevoApiKey.length).toBeGreaterThan(0);
      expect(cfg.brevoOrgId.length).toBeGreaterThan(0);
    }
  });
});
