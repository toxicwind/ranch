/**
 * Spatial LRUD focus engine.
 *
 * Netflix-grade TV navigation: directional pad moves focus over a 2D grid of
 * items. LRUD (Last-Recently-Used-Direction) memory means moving DOWN then
 * UP returns focus to the last-visited row in that column — matching the
 * muscle-memory users build across Netflix/Disney+/Hulu.
 *
 * Pure functions, zero dependencies, fully TDD'd.
 */

import type { FocusState } from "./types";

export interface FocusMoveResult {
	focusedId: string | null;
	x: number;
	y: number;
	moved: boolean;
}

/** Build a fresh focus state over a grid. */
export function createFocus(
	gridW: number,
	gridH: number,
	startX = 0,
	startY = 0,
	wrap = false,
): FocusState {
	const x = clamp(startX, 0, gridW - 1);
	const y = clamp(startY, 0, gridH - 1);
	return {
		focusedId: null,
		x,
		y,
		gridW,
		gridH,
		wrap,
		// LRUD memory: per-column last row, per-row last column.
		colLastRow: new Map<number, number>(),
		rowLastCol: new Map<number, number>(),
	};
}

/** Move focus one step in a direction. LRUD memory updates on every move. */
export function moveFocus(
	state: FocusState,
	direction: "up" | "down" | "left" | "right",
): FocusMoveResult {
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

	// LRUD: restore from PRIOR state maps (before recording this move),
	// then record where we were for the next reversal.
	let restoreX = nx;
	let restoreY = ny;
	if (direction === "up" || direction === "down") {
		const known = state.colLastRow.get(nx);
		if (known !== undefined) restoreY = known;
	}
	if (direction === "left" || direction === "right") {
		const known = state.rowLastCol.get(ny);
		if (known !== undefined) restoreX = known;
	}

	const colLastRow = new Map(state.colLastRow);
	const rowLastCol = new Map(state.rowLastCol);
	colLastRow.set(x, y);
	rowLastCol.set(y, x);

	// Clamp in case LRUD target is out of bounds.
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
		rowLastCol,
	};
}

/** Jump focus to an absolute grid cell. */
export function jumpFocus(
	state: FocusState,
	x: number,
	y: number,
): FocusMoveResult {
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
		rowLastCol: state.rowLastCol,
	};
}

/** Set the id focused at the current cell. */
export function setFocusedId(
	state: FocusState,
	id: string | null,
): FocusState {
	return { ...state, focusedId: id };
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}
