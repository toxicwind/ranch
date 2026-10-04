/**
 * spark-harvest/src/profile.ts
 *
 * Executable agent profile for the Muse Spark estate. Loads the
 * machine-readable profile.json, validates it against the observed
 * estate identifiers, and exposes the pre-agent launch path that
 * injects the autonomy directive for Muse Spark autoloaded agents.
 *
 * Observed estate facts (2026-09-30 / 2026-10-01, receipts in ../README.md
 * and /home/toxic/estate/hatch/spark-corpus/):
 * - Runtime: hatch cell (htch-runtime, /home/hatch, /opt/hatch)
 * - Model identifier in runtime trace: "Muse Spark"
 * - Muse Spark = Meta Superintelligence Labs model family, internal codename
 *   "Avocado" (per public concept docs and model-tracker entries in corpus)
 * - VM infra: *.metaaivm.com (hatch.metaaivm.com Noise_XX gateway)
 * - Rejected: "Google VM" — zero Google-Cloud VM evidence anywhere
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SparkHarvestProfile {
  name: string;
  model_family: string;
  model_org: string;
  internal_codename: string;
  versions_observed: string[];
  openrouter_ids: string[];
  context_window: number;
  runtime: string;
  box_observed: string;
  vm_domain: string;
  vm_fqdn_observed: string;
  gateway: { host: string; url: string; handshake: string };
  identifiers: string[];
  rejected_claims: string[];
  rejected_claim_reasons: Record<string, string>;
  corpus: string;
  harvest_dir: string;
  fork: string;
  fork_upstream: string;
  fork_commit: string;
  task_directive: string;
}

let cached: SparkHarvestProfile | null = null;

/** Load and validate profile.json (relative to this file's package dir). */
export async function loadProfile(): Promise<SparkHarvestProfile> {
  if (cached) return cached;
  const url = new URL("../profile.json", import.meta.url);
  const raw = readFileSync(url, "utf8");
  const profile = JSON.parse(raw) as SparkHarvestProfile;
  validateProfile(profile);
  cached = profile;
  return profile;
}

export function validateProfile(p: SparkHarvestProfile): void {
  const need = (ok: boolean, msg: string) => {
    if (!ok) throw new Error(`profile validation failed: ${msg}`);
  };
  need(p.name === "spark-harvest", "name");
  need(p.model_family === "Muse Spark", "model_family");
  need(p.model_org === "Meta Superintelligence Labs", "model_org");
  need(p.runtime === "hatch", "runtime");
  need(p.vm_domain === "metaaivm.com", "vm_domain");
  need(Array.isArray(p.identifiers) && p.identifiers.includes("muse-spark"), "identifiers");
  need(Array.isArray(p.rejected_claims) && p.rejected_claims.includes("google-vm"), "rejected_claims");
  need(typeof p.rejected_claim_reasons["google-vm"] === "string", "rejected_claim_reasons");
  need(typeof p.task_directive === "string" && p.task_directive.length > 20, "task_directive");
  need(p.fork === "toxicwind/meta-muse-spark-api", "fork");
  need(/^[0-9a-f]{40}$/.test(p.fork_commit), "fork_commit sha");
  // Corpus filesystem checks only apply on the estate itself (where the
  // corpus dir exists). Off-estate (CI runners), the static claims above
  // are still validated but the local paths cannot be.
  if (existsSync(p.corpus)) {
    for (const repo of ["meta-muse-spark-api", "muse-spark"]) {
      need(existsSync(join(p.corpus, repo)), `corpus has ${repo}`);
    }
  }
}

/** Pre-agent launch path: returns the profile plus the autonomy directive. */
export async function launchWithProfile(): Promise<{ profile: SparkHarvestProfile; directive: string }> {
  const profile = await loadProfile();
  return { profile, directive: profile.task_directive };
}
