/**
 * types.ts — squawk-persona domain model + Zod schema.
 *
 * A "persona" is the estate's single binding of an agent identity to the
 * artifacts squawk needs to act as that identity:
 *   identity   the from:/sender name (what gets posted as)
 *   key        HMAC signing key name -> $FLEET_KEYS_DIR/<key>.key
 *   token      auth token path (estate-chat :25120 or squawk feed), by stable
 *              name resolved from the registry's `tokens` map
 *   role       what the identity does (drift-watch, coordinator, agent…)
 *   channels   squawk channels the persona reads/sends by default
 *
 * Runtime validation is via the `personaSchema` / `registrySchema` Zod schemas
 * so a malformed personas.yml fails loudly at load, never silently.
 */

import { z } from "zod";

export const VALID_TYPES = ["INFO", "ASK", "RESULT", "HOLD", "VETO"] as const;

/** The subset of a persona that squawk's runners.yml profile understands. */
export const personaSchema = z
  .object({
    identity: z.string().min(1),
    key: z.string().min(1).optional(),
    token: z.string().nullable().optional(),
    role: z.string().optional().default(""),
    description: z.string().optional().default(""),
    channels: z.array(z.string().min(1)).optional().default([]),
    poll_interval: z.number().int().positive().optional(),
    heartbeat: z.number().int().positive().optional(),
    message_template: z.string().optional(),
  })
  .strict();

export const registrySchema = z
  .object({
    version: z.number().int().positive().default(1),
    default_sender: z.string().min(1).default("ember"),
    tokens: z.record(z.string(), z.string()).default({}),
    profiles: z.record(z.string(), personaSchema).default({}),
  })
  .strict();

export type Persona = z.infer<typeof personaSchema>;
export type Registry = z.infer<typeof registrySchema>;

export interface ResolvedPersona {
  persona: string;
  identity: string;
  key: string;
  key_file: string;
  token_file: string | null;
  role: string;
  channels: string[];
}
