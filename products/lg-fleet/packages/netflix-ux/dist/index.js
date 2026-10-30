// src/focus.ts
function createFocus(gridW, gridH, startX = 0, startY = 0, wrap = false) {
  const x = clamp(startX, 0, gridW - 1);
  const y = clamp(startY, 0, gridH - 1);
  return {
    focusedId: null,
    x,
    y,
    gridW,
    gridH,
    wrap,
    colLastRow: new Map,
    rowLastCol: new Map
  };
}
function moveFocus(state, direction) {
  const { x, y, gridW, gridH, wrap } = state;
  let nx = x;
  let ny = y;
  let moved = false;
  if (direction === "left") {
    if (x > 0) {
      nx = x - 1;
      moved = true;
    } else if (wrap) {
      nx = gridW - 1;
      moved = true;
    }
  } else if (direction === "right") {
    if (x < gridW - 1) {
      nx = x + 1;
      moved = true;
    } else if (wrap) {
      nx = 0;
      moved = true;
    }
  } else if (direction === "up") {
    if (y > 0) {
      ny = y - 1;
      moved = true;
    } else if (wrap) {
      ny = gridH - 1;
      moved = true;
    }
  } else if (direction === "down") {
    if (y < gridH - 1) {
      ny = y + 1;
      moved = true;
    } else if (wrap) {
      ny = 0;
      moved = true;
    }
  }
  if (!moved) {
    return { focusedId: state.focusedId, x, y, moved: false };
  }
  let restoreX = nx;
  let restoreY = ny;
  if (direction === "up" || direction === "down") {
    const known = state.colLastRow.get(nx);
    if (known !== undefined)
      restoreY = known;
  }
  if (direction === "left" || direction === "right") {
    const known = state.rowLastCol.get(ny);
    if (known !== undefined)
      restoreX = known;
  }
  const colLastRow = new Map(state.colLastRow);
  const rowLastCol = new Map(state.rowLastCol);
  colLastRow.set(x, y);
  rowLastCol.set(y, x);
  restoreX = clamp(restoreX, 0, gridW - 1);
  restoreY = clamp(restoreY, 0, gridH - 1);
  return {
    focusedId: state.focusedId,
    x: restoreX,
    y: restoreY,
    moved: true,
    gridW,
    gridH,
    wrap,
    colLastRow,
    rowLastCol
  };
}
function jumpFocus(state, x, y) {
  const nx = clamp(x, 0, state.gridW - 1);
  const ny = clamp(y, 0, state.gridH - 1);
  if (nx === state.x && ny === state.y) {
    return { focusedId: state.focusedId, x: state.x, y: state.y, moved: false };
  }
  return {
    focusedId: state.focusedId,
    x: nx,
    y: ny,
    moved: true,
    gridW: state.gridW,
    gridH: state.gridH,
    wrap: state.wrap,
    colLastRow: state.colLastRow,
    rowLastCol: state.rowLastCol
  };
}
function setFocusedId(state, id) {
  return { ...state, focusedId: id };
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
// src/billboard.ts
function createBillboard(items, opts = {}) {
  const index = clamp2(opts.startIndex ?? 0, 0, Math.max(0, items.length - 1));
  return {
    items,
    index,
    autoplay: opts.autoplay ?? true,
    intervalMs: opts.intervalMs ?? 6000,
    elapsedMs: 0
  };
}
function tickBillboard(state, dtMs) {
  if (state.items.length === 0)
    return state;
  const next = { ...state, elapsedMs: state.elapsedMs + dtMs };
  if (!state.autoplay)
    return next;
  if (next.elapsedMs >= next.intervalMs) {
    next.elapsedMs = 0;
    next.index = (next.index + 1) % next.items.length;
  }
  return next;
}
function selectBillboardItem(state, index) {
  if (index < 0 || index >= state.items.length)
    return state;
  return { ...state, index, autoplay: false };
}
function currentBillboardItem(state) {
  return state.items[state.index];
}
function clamp2(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
// src/epg.ts
function createEPG(programs) {
  const byCh = new Map;
  for (const p of programs) {
    if (!p.channelId)
      continue;
    const arr = byCh.get(p.channelId) ?? [];
    arr.push(p);
    byCh.set(p.channelId, arr);
  }
  const channelIds = Array.from(byCh.keys()).sort();
  const rails = [];
  let channelNumber = 1;
  for (const channelId of channelIds) {
    const progs = byCh.get(channelId);
    progs.sort((a, b) => a.startMs - b.startMs);
    const now = progs.find((p) => p.startMs <= Date.now() && Date.now() < p.endMs);
    const nextIdx = progs.findIndex((p) => p.startMs > Date.now());
    const next = nextIdx >= 0 ? progs[nextIdx] : undefined;
    rails.push({
      channelId,
      channelNumber: channelNumber++,
      channelName: progs[0]?.title ?? channelId,
      now,
      next,
      programs: progs
    });
  }
  const byChannel = new Map(rails.map((r) => [r.channelId, r]));
  return { rails, byChannel };
}
function getRail(state, channelId) {
  return state.byChannel.get(channelId);
}
function nowNextFor(state, channelId) {
  const rail = state.byChannel.get(channelId);
  return rail ? { now: rail.now, next: rail.next } : { now: undefined, next: undefined };
}
// src/switcher.ts
function createSwitcher(initialChannel = null) {
  return { currentChannel: initialChannel, lastSwitchMs: 0, history: [] };
}
function switchChannel(state, channelId, nowMs) {
  const buffered = state.currentChannel !== null && state.history.length > 0;
  const switchMs = buffered ? 200 : 800;
  const next = {
    currentChannel: channelId,
    lastSwitchMs: nowMs,
    history: [...state.history, channelId]
  };
  const result = {
    ok: true,
    channelId,
    switchMs,
    buffered
  };
  return { state: next, result };
}
function switchResultOk(result) {
  return result.ok && result.switchMs < 1000;
}
// src/osd.ts
function createOSD() {
  return { visible: false, message: "" };
}
function showOSD(state, message, timeoutMs = 3000) {
  return { visible: true, message, timeoutMs };
}
function hideOSD(state) {
  return { visible: false, message: "", timeoutMs: undefined };
}
function tickOSD(state, dtMs) {
  if (!state.visible || state.timeoutMs === undefined)
    return state;
  const next = { ...state, timeoutMs: state.timeoutMs - dtMs };
  if (next.timeoutMs <= 0)
    return hideOSD(next);
  return next;
}
export {
  createBillboard,
  createEPG,
  createFocus,
  createOSD,
  createSwitcher,
  currentBillboardItem,
  getRail,
  hideOSD,
  jumpFocus,
  moveFocus,
  nowNextFor,
  selectBillboardItem,
  setFocusedId,
  showOSD,
  switchChannel,
  switchResultOk,
  tickBillboard,
  tickOSD
};
