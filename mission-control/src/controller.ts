// mission-control: event-driven continuation controller.
// Watches missions/<id>/events/ with fs.watch (inotify). No timers, no
// sleep loops, no subagents. On each terminal event file it classifies the
// run's observable evidence and, unless proven complete, emits a fresh
// relaunch directive (new activity + task + chat IDs) into outbox/.
// Restart survival: state is the filesystem; on boot it replays any
// unprocessed event files before watching.

import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile, mkdir, rename, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { classifyTerminal } from "./classify.ts";
import type { RelaunchDirective, RunEvidence } from "./types.ts";

export const ROOT = process.env.MISSION_ROOT ?? join(import.meta.dir, "..", "state");
const OUTBOX = join(ROOT, "outbox");

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

async function loadEvidence(missionId: string, eventFile: string): Promise<RunEvidence> {
  const raw = await readFile(join(ROOT, "missions", missionId, "events", eventFile), "utf8");
  return JSON.parse(raw) as RunEvidence;
}

export async function processEvent(missionId: string, eventFile: string): Promise<RelaunchDirective | null> {
  let evidence: RunEvidence;
  try {
    evidence = await loadEvidence(missionId, eventFile);
  } catch (err) {
    // Already consumed by a duplicate watch event: not an error.
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
  const c = classifyTerminal(evidence);
  const eventsDir = join(ROOT, "missions", missionId, "events");
  const doneDir = join(ROOT, "missions", missionId, "processed");
  await ensureDir(doneDir);
  await rename(join(eventsDir, eventFile), join(doneDir, eventFile));

  if (!c.continue) {
    // Proven complete: close the mission with the receipt.
    await writeFile(
      join(ROOT, "missions", missionId, "CLOSED"),
      JSON.stringify({ runId: evidence.runId, reason: c.reason, at: new Date().toISOString() }, null, 2),
    );
    return null;
  }

  const directive: RelaunchDirective = {
    directiveId: randomUUID(),
    parentMissionId: missionId,
    parentRunId: evidence.runId,
    terminal: c.terminal,
    reason: c.reason,
    activityId: randomUUID(),
    taskId: randomUUID(),
    chatId: randomUUID(),
    issuedAt: new Date().toISOString(),
  };
  await ensureDir(OUTBOX);
  await writeFile(join(OUTBOX, `${directive.directiveId}.json`), JSON.stringify(directive, null, 2));
  return directive;
}

/** Replay any event files left unprocessed (crash/restart), then watch. */
export async function boot(): Promise<void> {
  await ensureDir(ROOT);
  await ensureDir(OUTBOX);
  const missionsDir = join(ROOT, "missions");
  let missions: string[] = [];
  try {
    const entries = await readdir(missionsDir, { withFileTypes: true });
    missions = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    missions = [];
  }
  for (const m of missions) {
    const eventsDir = join(missionsDir, m, "events");
    let files: string[] = [];
    try {
      files = await readdir(eventsDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        await processEvent(m, f);
        console.log(`replayed ${m}/${f}`);
      } catch (err) {
        console.error(`replay failed ${m}/${f}:`, err);
      }
    }
  }
}

export function watchMissions(): void {
  const missionsDir = join(ROOT, "missions");
  ensureDir(missionsDir).then(() => {
    const watcher = watch(missionsDir, { recursive: true }, async (event, filename) => {
      if (event !== "rename" || !filename || !filename.endsWith(".json")) return;
      // filename looks like "<mission>/events/<file>.json"
      const parts = filename.split("/");
      if (parts.length !== 3 || parts[1] !== "events") return;
      const [missionId, , eventFile] = parts;
      try {
        await stat(join(missionsDir, missionId, "events", eventFile));
      } catch {
        return; // deletion, not arrival
      }
      try {
        const d = await processEvent(missionId, eventFile);
        console.log(d ? `relaunch ${d.directiveId} <- ${d.terminal}` : `closed ${missionId}`);
      } catch (err) {
        console.error(`process failed ${missionId}/${eventFile}:`, err);
      }
    });
    watcher.on("error", (err) => console.error("watcher error:", err));
    console.log(`mission-control watching ${missionsDir}`);
  });
}

if (import.meta.main) {
  await boot();
  watchMissions();
  // Keep the process alive on the watcher's event loop; no timers.
  await new Promise(() => {});
}
