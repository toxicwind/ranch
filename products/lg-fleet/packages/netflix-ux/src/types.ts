/** Netflix-Max TV UI types — core domain model for SLATE. */

export type ChannelId = string;
export type ProgramId = string;
export type AssetId = string;

/** A TV program / title with rich metadata for hero billboard + EPG rails. */
export interface Program {
  id: ProgramId;
  channelId?: ChannelId;
  title: string;
  description?: string;
  poster?: AssetId;        // hero artwork asset id
  backdrop?: AssetId;      // 16:9 backdrop for billboard
  logo?: AssetId;          // channel/network logo
  startMs: number;         // epoch ms
  endMs: number;           // epoch ms
  genre?: string[];
  rating?: string;
  durationMs: number;
  live?: boolean;
  hd?: boolean;
  instantSwitch?: boolean; // channel supports zero-buffer switch
}

/** EPG rail entry — a channel + its now/next programs. */
export interface EPGRail {
  channelId: ChannelId;
  channelNumber: number;
  channelName: string;
  channelLogo?: AssetId;
  now: Program | undefined;
  next: Program | undefined;
  programs: Program[];
}

/** Focus engine state — LRUD spatial navigation over a 2D grid. */
export interface FocusState {
  focusedId: string | null;
  x: number;        // column in grid
  y: number;        // row in grid
  gridW: number;
  gridH: number;
  wrap: boolean;    // wrap edges
}

/** OSD overlay state. */
export interface OSD {
  visible: boolean;
  message: string;
  timeoutMs?: number;
}

/** Billboard (hero) carousel state. */
export interface Billboard {
  items: Program[];
  index: number;
  autoplay: boolean;
  intervalMs: number;
}

/** Instant channel switcher result. */
export interface SwitchResult {
  ok: boolean;
  channelId: ChannelId;
  switchMs: number;
  buffered: boolean;
  error?: string;
}
