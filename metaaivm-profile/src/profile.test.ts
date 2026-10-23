/**
 * metaaivm-profile/src/profile.test.ts
 *
 * Regression: the executable profile loads, validates, and injects the
 * directive through the pre-agent path for MetaAIVM-identified agents.
 */
import { describe, test, expect } from "bun:test";
import { loadProfile, launchWithMetaAIVMProfile } from "./profile";
import { AUTONOMY_POLICY } from "task-launch/src/directive";

describe("metaaivm-profile", () => {
  test("profile.json loads and validates", async () => {
    const p = await loadProfile();
    expect(p.name).toBe("metaaivm-profile");
    expect(p.vm_domain).toBe("metaaivm.com");
    expect(p.gateway.url).toBe("wss://hatch.metaaivm.com/v1/noise");
    expect(p.gateway.handshake).toBe("Noise_XX_25519_AESGCM_SHA256");
    expect(p.identifiers).toContain("ipnext");
    expect(p.identifiers).toContain("hatch-autoloaded");
    expect(p.fork_candidate).toBe("nikships/muse-cli");
  });

  test("ipnext-identified agent gets the directive via the pre-agent path", () => {
    const out = launchWithMetaAIVMProfile("Audit the queue.", "your-tasks", "yt-1", {
      IPNEXT_MODEL: "ipnext/avocado-5.16-v4",
    } as NodeJS.ProcessEnv);
    expect(out.profileMatched).toBe(true);
    expect(out.effectiveBody.includes(AUTONOMY_POLICY.marker)).toBe(true);
  });

  test("metaaivm.com VM identity matches", () => {
    const out = launchWithMetaAIVMProfile("Audit the queue.", "connector-run", "cr-1", {
      HOSTNAME: "f4f307f9-74e5-4df4-af81-4cab07043424.metaaivm.com",
    } as NodeJS.ProcessEnv);
    expect(out.profileMatched).toBe(true);
  });

  test("unidentified environment passes through unchanged", () => {
    const out = launchWithMetaAIVMProfile("Audit the queue.", "direct-chat", "dc-1", {
    } as NodeJS.ProcessEnv);
    expect(out.profileMatched).toBe(false);
    expect(out.effectiveBody).toBe("Audit the queue.");
  });
});
