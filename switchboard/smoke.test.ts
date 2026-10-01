/**
 * smoke.test.ts — switchboard has no unit-testable modules (hyper-race.ts,
 * proof.ts, and server.ts are executable scripts with top-level await).
 * This smoke test verifies each script at least compiles, so the
 * `switchboard:test` moon task has something real to run instead of
 * failing with "No tests found".
 */
import { describe, test, expect } from "bun:test";

const SCRIPTS = ["./hyper-race.ts", "./proof.ts", "./server.ts"];

describe("switchboard scripts compile", () => {
	for (const script of SCRIPTS) {
		test(`${script} builds`, async () => {
			const proc = Bun.spawn(
				["bun", "build", script, "--outfile", "/dev/null"],
				{
					cwd: import.meta.dir,
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			const code = await proc.exited;
			const stderr = await new Response(proc.stderr).text();
			expect(code).toBe(0);
			if (code !== 0) {
				console.error(stderr);
			}
		});
	}
});
