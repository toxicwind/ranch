/**
 * OSD overlay — transient on-screen messages (channel change, recording,
 * parental control). Pure state machine with ttl.
 */

import type { OSD } from "./types";

export function createOSD(): OSD {
  return { visible: false, message: "" };
}

export function showOSD(state: OSD, message: string, timeoutMs = 3000): OSD {
  return { visible: true, message, timeoutMs };
}

export function hideOSD(state: OSD): OSD {
  return { visible: false, message: "", timeoutMs: undefined };
}

export function tickOSD(state: OSD, dtMs: number): OSD {
  if (!state.visible || state.timeoutMs === undefined) return state;
  const next = { ...state, timeoutMs: state.timeoutMs - dtMs };
  if (next.timeoutMs <= 0) return hideOSD(next);
  return next;
}
