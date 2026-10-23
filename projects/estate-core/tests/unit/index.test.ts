import { describe, it, expect } from "bun:test";
import { loadConfig, isConfigured, type EstateConfig } from "../../src/index";

describe("loadConfig", () => {
  it("reads NIM_API_KEY from environment", () => {
    process.env.NIM_API_KEY = "test-nim-key";
    process.env.BREVO_API_KEY = "test-brevo-key";
    process.env.BREVO_ORG_ID = "test-org-id";

    const cfg = loadConfig();
    expect(cfg.nimApiKey).toBe("test-nim-key");
    expect(cfg.brevoApiKey).toBe("test-brevo-key");
    expect(cfg.brevoOrgId).toBe("test-org-id");
    expect(cfg.nimBaseUrl).toBe("http://127.0.0.1:25193/v1");
  });

  it("defaults NIM_BASE_URL when not set", () => {
    delete process.env.NIM_BASE_URL;
    const cfg = loadConfig();
    expect(cfg.nimBaseUrl).toBe("http://127.0.0.1:25193/v1");
  });
});

describe("isConfigured", () => {
  it("returns true when all keys present", () => {
    const cfg: EstateConfig = {
      nimApiKey: "nvapi-test",
      brevoApiKey: "bak-test",
      brevoOrgId: "org-test",
      nimBaseUrl: "http://127.0.0.1:25193/v1",
    };
    expect(isConfigured(cfg)).toBe(true);
  });

  it("returns false when nimApiKey missing", () => {
    const cfg: EstateConfig = {
      nimApiKey: "",
      brevoApiKey: "bak-test",
      brevoOrgId: "org-test",
      nimBaseUrl: "http://127.0.0.1:25193/v1",
    };
    expect(isConfigured(cfg)).toBe(false);
  });

  it("returns false when brevoApiKey missing", () => {
    const cfg: EstateConfig = {
      nimApiKey: "nvapi-test",
      brevoApiKey: "",
      brevoOrgId: "org-test",
      nimBaseUrl: "http://127.0.0.1:25193/v1",
    };
    expect(isConfigured(cfg)).toBe(false);
  });
});
