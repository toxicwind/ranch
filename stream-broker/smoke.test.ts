/**
 * smoke.test.ts — stream-broker has no unit-testable modules (src/index.ts
 * is a server entrypoint with import-time side effects). This smoke test
 * verifies each script at least compiles, so the `stream-broker:test`
 * moon task has something real to run instead of failing with
 * "No tests found".
 */
import { describe, test, expect } from "bun:test";

const SCRIPTS = ["./src/index.ts", "./scripts/mise-build.sh"];

describe("stream-broker scripts compile", () => {
	for (const script of SCRIPTS) {
		test(`${script} builds`, async () => {
			const proc = Bun.spawn(
				["bun", "build", "--target=node", script, "--outfile", "/dev/null"],
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
