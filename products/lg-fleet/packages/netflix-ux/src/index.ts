/** @slate/netflix-ux — Netflix-Max TV UI library for SLATE webOS. */

export type {
  ChannelId,
  ProgramId,
  AssetId,
  Program,
  EPGRail,
  FocusState,
  OSD,
  Billboard,
  SwitchResult,
  FocusMoveResult,
} from "./types";

export {
  createFocus,
  moveFocus,
  jumpFocus,
  setFocusedId,
  type FocusState,
  type FocusMoveResult,
} from "./focus";

export {
  createBillboard,
  tickBillboard,
  selectBillboardItem,
  currentBillboardItem,
  type BillboardState,
} from "./billboard";

export {
  createEPG,
  getRail,
  nowNextFor,
  type EPGState,
  type EPGRail,
} from "./epg";

export {
  createSwitcher,
  switchChannel,
  switchResultOk,
  type SwitcherState,
  type SwitchResult,
} from "./switcher";

export {
  createOSD,
  showOSD,
  hideOSD,
  tickOSD,
  type OSD,
} from "./osd";
