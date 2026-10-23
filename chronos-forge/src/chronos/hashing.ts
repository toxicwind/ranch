/**
 * Deterministic identity derivation.
 *
 * repo_hash = first 10 hex of sha256(repo_root absolute path)
 * agent_id  = first 8 hex of sha256(hostname + uid + pane id)
 * run_id    = UTC timestamp compact + 6 random hex
 */

import { createHash } from 'node:crypto';
import { hostname, userInfo } from 'node:os';

export function repoHash(repoRoot: string): string {
  const abs = normalizePath(repoRoot);
  return createHash('sha256').update(abs, 'utf8').digest('hex').slice(0, 10);
}

export function agentId(paneId = ''): string {
  const uid = String(userInfo().uid ?? 0);
  const material = `${hostname()}|${uid}|${paneId}`;
  return createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 8);
}

export function runId(now: Date = new Date()): string {
  const compact =
    now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '');
  const rand = createHash('sha256')
    .update(String(Math.random()) + compact)
    .digest('hex')
    .slice(0, 6);
  return `${compact}_${rand}`;
}

/**
 * Normalize so that the same logical path on the same OS yields one hash.
 * Windows is case-insensitive; separators are unified.
 */
export function normalizePath(p: string): string {
  const unified = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? unified.toLowerCase() : unified;
}

export function shortSha256(content: string | Buffer, length = 16): string {
  return createHash('sha256')
    .update(typeof content === 'string' ? Buffer.from(content, 'utf8') : content)
    .digest('hex')
    .slice(0, length);
}
