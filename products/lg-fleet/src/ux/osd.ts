/** @slate/ux — OSD channel switcher: digit-buffer + auto-commit + timeout. */

export interface OsdOptions {
	channels?: readonly string[];
	onCommit?: (channelId: string) => void;
	timeoutMs?: number;
}

export function createOsd(timeoutMs = 3000, options: OsdOptions = {}) {
	let buf = "";
	let timer: ReturnType<typeof setTimeout> | null = null;
	const { channels = [], onCommit } = options;

	const resetTimer = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => { buf = ""; }, timeoutMs);
	};

	const numeric = (c: string): string => c.replace(/[^0-9]/g, "");
	const tryCommit = () => {
		if (!channels.length || !onCommit) return false;
		const exact = channels.find(c => numeric(c) === buf);
		if (exact) {
			buf = "";
			onCommit(exact);
			return true;
		}
		const matches = channels.filter(c => numeric(c).startsWith(buf));
		if (buf.length >= 2 && matches.length === 1) {
			buf = "";
			onCommit(matches[0]!);
			return true;
		}
		return false;
	};

	return {
		digit(d: string): void {
			if (!/^[0-9]$/.test(d)) return;
			buf += d;
			resetTimer();
			tryCommit();
		},
		buffer(): string {
			return buf;
		},
		/** Force-commit current buffer (Enter key). */
		commit(): string | undefined {
			const exact = channels.find(c => c === buf);
			if (exact && onCommit) { buf = ""; onCommit(exact); return exact; }
			return undefined;
		},
	};
}
