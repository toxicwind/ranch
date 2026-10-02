/**
 * metaaivm-profile/src/profile.ts
 *
 * Executable agent profile for the MetaAIVM estate. Loads the
 * machine-readable profile.json, validates it against the observed
 * estate identifiers, and exposes the pre-agent launch path that
 * injects the autonomy directive for Hatch-autoloaded / ipnext agents.
 *
 * Observed estate facts (2026-09-30, receipts in ../README.md and
 * /home/toxic/estate/hatch/metaaivm-corpus/):
 * - metaaivm.com: Meta's per-user AI VM domain (WHOIS: Meta Platforms, Inc.)
 * - Gateway: wss://hatch.metaaivm.com/v1/noise (Noise_XX_25519_AESGCM_SHA256)
 * - Model identifier seen in agent rows: ipnext/avocado-5.16-v4
 */
import { launchWithProfile as taskLaunchWithProfile } from "task-launch/src/profile";
import type { LaunchSurface } from "task-launch/src/launcher";

export interface MetaAIVMProfile {
  name: string;
  vm_domain: string;
  vm_fqdn_observed: string;
  gateway: {
    host: string;
    url: string;
    handshake: string;
    services: Record<string, number>;
  };
  identifiers: string[];
  model_family: string;
  corpus: string;
  fork_candidate: string;
  task_directive: string;
}

let cached: MetaAIVMProfile | null = null;

/** Load and validate profile.json (relative to this file's package dir). */
export async function loadProfile(): Promise<MetaAIVMProfile> {
  if (cached) return cached;
  const url = new URL("../profile.json", import.meta.url);
  const raw = await Bun.file(url).json();
  const p = raw as MetaAIVMProfile;
  // Validate the load-bearing fields; fail closed on a corrupt profile.
  if (p.vm_domain !== "metaaivm.com") throw new Error("profile: vm_domain mismatch");
  if (!p.gateway?.url?.startsWith("wss://hatch.metaaivm.com"))
    throw new Error("profile: gateway url mismatch");
  if (!Array.isArray(p.identifiers) || !p.identifiers.includes("ipnext"))
    throw new Error("profile: identifiers must include ipnext");
  cached = p;
  return p;
}

/**
 * Pre-agent path for MetaAIVM-identified agents: delegates to the
 * task-launch profile, which injects the autonomy directive when the
 * estate identity matches (Hatch autoloaded, *.metaaivm.com, ipnext/).
 */
export function launchWithMetaAIVMProfile(
  body: string,
  surface: LaunchSurface,
  originRef: string,
  env: NodeJS.ProcessEnv = process.env
) {
  return taskLaunchWithProfile(body, surface, originRef, env);
}
