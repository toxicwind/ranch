/**
 * Instant channel switcher — zero-buffer channel change with simulated
 * buffering state. Pure state machine; the actual stream swap is the
 * consumer's responsibility (video element, HLS, etc.).
 */

import type { SwitchResult } from "./types";

export interface SwitcherState {
  currentChannel: string | null;
  lastSwitchMs: number;
  history: string[];
}

export function createSwitcher(initialChannel: string | null = null): SwitcherState {
  return { currentChannel: initialChannel, lastSwitchMs: 0, history: [] };
}

export function switchChannel(
  state: SwitcherState,
  channelId: string,
  nowMs: number,
): { state: SwitcherState; result: SwitchResult } {
  const buffered = state.currentChannel !== null && state.history.length > 0;
  const switchMs = buffered ? 200 : 800; // instant vs cold start
  const next: SwitcherState = {
    currentChannel: channelId,
    lastSwitchMs: nowMs,
    history: [...state.history, channelId],
  };
  const result: SwitchResult = {
    ok: true,
    channelId,
    switchMs,
    buffered,
  };
  return { state: next, result };
}

export function switchResultOk(result: SwitchResult): boolean {
  return result.ok && result.switchMs < 1000; // "instant" threshold
}
