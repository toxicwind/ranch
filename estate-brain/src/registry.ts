/**
 * registry.ts — load + validate the persona registry (persons.yml).
 *
 * Uses the `yaml` package for a real parse and Zod for schema validation.
 * Zero `node:` imports beyond what Bun needs — reads via Bun.file().
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { Persona, Registry, ResolvedPersona } from "./types";
import { personaSchema, registrySchema } from "./types";

export const REGISTRY_PATH = fileURLToPath(
  new URL("../personas/personas.yml", import.meta.url),
);
export const DEFAULT_KEYS_DIR =
  process.env.FLEET_KEYS_DIR ??
  join(process.env.HOME ?? "/home/toxic", ".fleet-bus", "keys");
export const DEFAULT_SQUAWK_ROOT = join(
  process.env.HOME ?? "/home/toxic",
  ".fleet-bus",
  "squawk-root",
);

export class PersonaError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PersonaError";
  }
}

/** Load personas.yml (Bun.file → text → yaml → zod). Returns a frozen registry. */
export async function loadRegistry(
  path: string = REGISTRY_PATH,
): Promise<Registry> {
  const file = Bun.file(path);
  if (!(await file.exists()))
    throw new PersonaError(`registry not found: ${path}`);
  const text = await file.text();
  return validateRegistry(parseYaml(text), path);
}

/** Non-async variant for tests / calls with the text already in hand. */
export function validateRegistry(
  doc: unknown,
  source = "personas.yml",
): Registry {
  const parsed = registrySchema.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    throw new PersonaError(`registry invalid (${source}): ${issues}`);
  }
  const reg = parsed.data;
  // Dereference optional persona fields (zod defaults already filled them).
  return reg;
}

export function personaOf(reg: Registry, name: string): Persona {
  const p = reg.profiles[name];
  if (!p) throw new PersonaError(`unknown persona '${name}'`);
  return personaSchema.parse(p);
}

export function expand(path: string): string {
  return path.startsWith("~")
    ? join(process.env.HOME ?? "/home/toxic", path.slice(1))
    : path;
}

export function tokenFile(reg: Registry, name: string | null): string | null {
  if (!name) return null;
  const p = reg.tokens[name];
  return p ? expand(p) : null;
}

export function keyFile(
  name: string,
  keysDir: string = DEFAULT_KEYS_DIR,
): string {
  return join(keysDir, `${name}.key`);
}

export function resolvePersona(
  reg: Registry,
  name: string,
  keysDir: string = DEFAULT_KEYS_DIR,
): ResolvedPersona {
  const p = personaOf(reg, name);
  const key = p.key ?? p.identity;
  return {
    persona: name,
    identity: p.identity,
    key,
    key_file: keyFile(key, keysDir),
    token_file: tokenFile(reg, p.token ?? null),
    role: p.role,
    channels: p.channels,
  };
}
