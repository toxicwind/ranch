import { describe, expect, test } from "bun:test";
import { loadProfile, launchWithProfile } from "./profile";

describe("spark-harvest profile", () => {
  test("loads and validates against observed estate identifiers", async () => {
    const p = await loadProfile();
    expect(p.name).toBe("spark-harvest");
    expect(p.model_family).toBe("Muse Spark");
    expect(p.model_org).toBe("Meta Superintelligence Labs");
    expect(p.internal_codename).toBe("Avocado");
    expect(p.runtime).toBe("hatch");
    expect(p.vm_domain).toBe("metaaivm.com");
    expect(p.gateway.host).toBe("hatch.metaaivm.com");
    expect(p.identifiers).toContain("muse-spark");
    expect(p.fork).toBe("toxicwind/meta-muse-spark-api");
    expect(p.fork_commit).toMatch(/^[0-9a-f]{40}$/);
  });

  test("model name never renames the runtime", async () => {
    const p = await loadProfile();
    // The autoload identifier "Muse Spark" names the model; the box stays hatch.
    expect(p.runtime).not.toBe("spark");
    expect(p.box_observed).toBe("htch-runtime");
  });

  test("google-vm claim is recorded as rejected with reasons", async () => {
    const p = await loadProfile();
    expect(p.rejected_claims).toContain("google-vm");
    expect(p.rejected_claim_reasons["google-vm"].length).toBeGreaterThan(20);
  });

  test("launch path injects the autonomy directive", async () => {
    const { profile, directive } = await launchWithProfile();
    expect(profile.name).toBe("spark-harvest");
    expect(directive).toBe(profile.task_directive);
    expect(directive.length).toBeGreaterThan(20);
  });
});
