// 🔥 Campfire — hyper-raced message posting.
// fleet-post ∥ squawk send, first-valid-wins. Spool on failure.
// A fallback is not a rollback.

import { $ } from "bun";

const SENDER = process.env.SQUAWK_SENDER || "campfire (ember's pack)";
const FLEET_POST = `${process.env.HOME}/workspace/bin/fleet-post`;
const SQUAWK = `${process.env.HOME}/workspace/bin/squawk`;

export interface PostResult {
  ok: boolean;
  via: "fleet-post" | "squawk-send" | "spooled" | "none";
  detail: string;
}

/**
 * Post a message to fleet. Hyper-races two write paths:
 *   A: fleet-post (itself hyper-raced internally, spools if bridge down)
 *   B: squawk send with SQUAWK_SENDER
 * First-valid-wins. If both fail, spool locally for later delivery.
 *
 * Human-like latency (HUMA, 2511.17315): a small jittered delay before
 * posting. Instant replies read as botty; a few seconds read as thinking.
 */
export async function post(channel: string, message: string): Promise<PostResult> {
  // 2-6 seconds, jittered. Thinking, not instant.
  const thinkMs = 2000 + Math.random() * 4000;
  await Bun.sleep(thinkMs);

  const pathA = (async (): Promise<PostResult> => {
    try {
      const proc = await $`${FLEET_POST} --sender ${SENDER} --channel ${channel} --message ${message}`
        .quiet()
        .nothrow();
      if (proc.exitCode === 0) {
        return { ok: true, via: "fleet-post", detail: "posted via fleet-post" };
      }
      return { ok: false, via: "fleet-post", detail: `exit ${proc.exitCode}: ${proc.stderr.toString().slice(0, 200)}` };
    } catch (e) {
      return { ok: false, via: "fleet-post", detail: String(e).slice(0, 200) };
    }
  })();

  const pathB = (async (): Promise<PostResult> => {
    try {
      const proc = await $`SQUAWK_SENDER=${SENDER} ${SQUAWK} send ${channel} ${message}`
        .quiet()
        .nothrow()
        .env({ ...process.env, SQUAWK_SENDER: SENDER });
      if (proc.exitCode === 0) {
        return { ok: true, via: "squawk-send", detail: "posted via squawk send" };
      }
      return { ok: false, via: "squawk-send", detail: `exit ${proc.exitCode}: ${proc.stderr.toString().slice(0, 200)}` };
    } catch (e) {
      return { ok: false, via: "squawk-send", detail: String(e).slice(0, 200) };
    }
  })();

  // First-valid-wins. But: if A wins, B may still complete — that's fine,
  // fleet-post dedupes by UUID. If B wins first, same.
  const results = await Promise.allSettled([pathA, pathB]);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) return r.value;
  }

  // Both failed — spool locally. Fallback, not rollback.
  const spoolDir = `${process.env.HOME}/.campfire/spool`;
  await $`mkdir -p ${spoolDir}`.quiet().nothrow();
  const ts = Date.now();
  const file = `${spoolDir}/${ts}-fleet.msg`;
  const content = `sender: ${SENDER}\nchannel: ${channel}\nts: ${ts}\n\n${message}\n`;
  await Bun.write(file, content);
  return { ok: false, via: "spooled", detail: `spooled to ${file}` };
}

/** Flush the spool — deliver anything that failed earlier. */
export async function flushSpool(): Promise<number> {
  const spoolDir = `${process.env.HOME}/.campfire/spool`;
  const glob = new Bun.Glob("*.msg");
  let delivered = 0;
  for await (const file of glob.scan(spoolDir)) {
    const path = `${spoolDir}/${file}`;
    const content = await Bun.file(path).text();
    const channelMatch = content.match(/^channel: (.+)$/m);
    const msgMatch = content.match(/\n\n([\s\S]+)$/);
    if (!channelMatch || !msgMatch) continue;
    const result = await post(channelMatch[1], msgMatch[1].trim());
    if (result.ok && result.via !== "spooled") {
      await $`rm ${path}`.quiet().nothrow();
      delivered++;
    }
  }
  return delivered;
}
