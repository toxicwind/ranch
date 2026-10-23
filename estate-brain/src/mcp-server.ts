// estate-brain-mcp — the fleet's identity/persona/agent brain as a first-class
// MCP server. Follows the estate mcp-dropin-guide (ranch/mcp-dropin-guide):
//   R-101 Content-Length framing   R-102 dual framing (CL + newline)
//   R-103 initialize 2024-11-05    R-201/202 tool schemas with descriptions
//   R-203 mutating tools require confirm:true
// Wraps the estate-brain CLI via Bun.spawn (same house pattern as grasp-hub).
// Read-only: list/show/resolve. Mutating: keygen/gen-runners/deploy/checkpoint
// and corral — all gate on `confirm:true`.
//
// Bun/TypeScript, zero npm deps, stdio.

const BIN =
  process.env.ESTATE_BRAIN_BIN ??
  new URL("../bin/estate-brain.ts", import.meta.url).pathname;
const BUN = process.env.ESTATE_BRAIN_BUN ?? "bun";
const TOOL_TIMEOUT_MS = 120_000;
const MAX_OUT = 24_000;
const MAX_ARG = 4_000;

function writeRpc(res: object) {
  const s = JSON.stringify(res);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(s, "utf8")}\r\n\r\n${s}\n`,
  );
}

function runBrain(args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolveP) => {
    const proc = Bun.spawn([BUN, BIN, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", TERM: "dumb" },
    });
    let out = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try {
        proc.kill();
      } catch {
        /* gone */
      }
    }, TOOL_TIMEOUT_MS);
    const pump = async () => {
      const dec = new TextDecoder();
      for await (const c of proc.stdout) out += dec.decode(c, { stream: true });
      for await (const c of proc.stderr) out += dec.decode(c, { stream: true });
      out += dec.decode();
    };
    (async () => {
      await pump();
      const code = await proc.exited;
      clearTimeout(timer);
      if (out.length > MAX_OUT)
        out = `${out.slice(0, MAX_OUT)}\n…[truncated ${out.length - MAX_OUT}]`;
      if (killed)
        resolveP({
          ok: false,
          out: `TIMEOUT after ${TOOL_TIMEOUT_MS / 1000}s\n${out}`,
        });
      else if (code !== 0)
        resolveP({ ok: false, out: out || `estate-brain exit ${code}` });
      else resolveP({ ok: true, out: out || "(no output)" });
    })();
  });
}

function cleanArg(v: unknown, name: string, max = MAX_ARG): string {
  if (typeof v !== "string" || v.trim().length === 0)
    throw new Error(`refused: ${name} must be a non-empty string`);
  if (v.length > max) throw new Error(`refused: ${name} exceeds ${max} chars`);
  if (v.includes("\0")) throw new Error(`refused: ${name} contains NUL`);
  return v;
}

function confirm(a: Record<string, unknown>, action: string): void {
  if (a.confirm !== true)
    throw new Error(
      `refused: this is a mutating action (${action}); pass confirm:true`,
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOLS: any[] = [
  {
    name: "brain_list",
    description:
      "List every persona in the fleet brain (identity, key, token, role, channels). Read-only.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "brain_show",
    description:
      "Detail one persona: identity, key file path, token file path, role, channels. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        persona: {
          type: "string",
          description: "persona name, e.g. 'coordinator'",
        },
      },
      required: ["persona"],
    },
  },
  {
    name: "brain_resolve",
    description:
      "Machine-readable persona resolution (JSON): key_file, token_file, identity, channels. Read-only.",
    inputSchema: {
      type: "object",
      properties: { persona: { type: "string", description: "persona name" } },
      required: ["persona"],
    },
  },
  {
    name: "brain_agents",
    description:
      "List the estate/Rig agent configs, each bound to its persona identity + sigil. Read-only.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "brain_validate",
    description:
      "Validate the registry and report which personas' keys/tokens resolve. Read-only.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "brain_keygen",
    description:
      "Ensure a persona's signing key exists (0600). MUTATING — needs confirm:true.",
    inputSchema: {
      type: "object",
      properties: {
        persona: { type: "string", description: "persona name" },
        confirm: { type: "boolean", description: "must be true to proceed" },
      },
      required: ["persona", "confirm"],
    },
  },
  {
    name: "brain_gen_runners",
    description:
      "Regenerate $SQUAWK_ROOT/runners.yml from the registry. MUTATING — needs confirm:true.",
    inputSchema: {
      type: "object",
      properties: {
        root: {
          type: "string",
          description:
            "squawk root (optional, default ~/.fleet-bus/squawk-root)",
        },
        confirm: { type: "boolean", description: "must be true to proceed" },
      },
      required: ["confirm"],
    },
  },
  {
    name: "brain_deploy",
    description:
      "Mirror all canonical agent.toml to the live OpenFang agents dir. MUTATING — needs confirm:true.",
    inputSchema: {
      type: "object",
      properties: {
        live_dir: {
          type: "string",
          description: "target dir (optional, default ~/.openfang/agents)",
        },
        confirm: { type: "boolean", description: "must be true to proceed" },
      },
      required: ["confirm"],
    },
  },
  {
    name: "brain_corral",
    description:
      "Run a Corral orchestration command as a persona. MUTATING — needs confirm:true.",
    inputSchema: {
      type: "object",
      properties: {
        persona: { type: "string", description: "persona to act as" },
        args: {
          type: "array",
          items: { type: "string" },
          description: "corral command line",
        },
        confirm: { type: "boolean", description: "must be true to proceed" },
      },
      required: ["persona", "confirm"],
    },
  },
  {
    name: "brain_checkpoint",
    description:
      "DelendAI shared-checkout-merge checkpoint+push as a persona. MUTATING — needs confirm:true.",
    inputSchema: {
      type: "object",
      properties: {
        persona: { type: "string", description: "persona to act as" },
        message: { type: "string", description: "commit message" },
        confirm: { type: "boolean", description: "must be true to proceed" },
      },
      required: ["persona", "message", "confirm"],
    },
  },
];

let buf = Buffer.alloc(0);

function extractMessage(): any | null {
  if (buf.length === 0) return null;
  while (buf.length > 0 && (buf[0] === 10 || buf[0] === 13))
    buf = buf.subarray(1);
  if (buf.length === 0) return null;
  if (/^content-length:/i.test(buf.subarray(0, 64).toString())) {
    const idx = buf.indexOf("\r\n\r\n");
    if (idx === -1) return null;
    const len = parseInt(
      (buf
        .subarray(0, idx)
        .toString()
        .match(/Content-Length:\s*(\d+)/i) || [])[1] || "0",
      10,
    );
    if (buf.length < idx + 4 + len) return null;
    const msg = JSON.parse(buf.subarray(idx + 4, idx + 4 + len).toString());
    buf = buf.subarray(idx + 4 + len);
    return msg;
  }
  const nl = buf.indexOf("\n");
  if (nl === -1) return null;
  const line = buf.subarray(0, nl).toString().trim();
  buf = buf.subarray(nl + 1);
  if (!line) return extractMessage();
  try {
    return JSON.parse(line);
  } catch {
    return extractMessage(); // skip non-JSON line, keep scanning
  }
}

process.stdin.on("data", async (chunk: Buffer) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const msg = extractMessage();
    if (!msg) break;
    const ok = (text: string) =>
      writeRpc({
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: [{ type: "text", text }] },
      });
    const err = (code: number, message: string) =>
      writeRpc({ jsonrpc: "2.0", id: msg.id, error: { code, message } });

    if (msg.method === "initialize") {
      writeRpc({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "estate-brain-mcp", version: "1.0.0" },
        },
      });
    } else if (msg.method === "notifications/initialized") {
      // no-op
    } else if (msg.method === "tools/list") {
      writeRpc({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
    } else if (msg.method === "tools/call") {
      const a: Record<string, unknown> = msg.params.arguments || {};
      try {
        const name = msg.params.name;
        let r: { ok: boolean; out: string } | null = null;
        if (name === "brain_list") r = await runBrain(["list"]);
        else if (name === "brain_agents") r = await runBrain(["agents"]);
        else if (name === "brain_validate") r = await runBrain(["validate"]);
        else if (name === "brain_show")
          r = await runBrain(["show", cleanArg(a.persona, "persona")]);
        else if (name === "brain_resolve")
          r = await runBrain(["resolve", cleanArg(a.persona, "persona")]);
        else if (name === "brain_keygen") {
          confirm(a, "keygen");
          r = await runBrain(["keygen", cleanArg(a.persona, "persona")]);
        } else if (name === "brain_gen_runners") {
          confirm(a, "gen-runners");
          const root =
            typeof a.root === "string" && a.root.trim() ? a.root : undefined;
          r = await runBrain(
            root ? ["gen-runners", "--root", root] : ["gen-runners"],
          );
        } else if (name === "brain_deploy") {
          confirm(a, "deploy");
          const live =
            typeof a.live_dir === "string" && a.live_dir.trim()
              ? a.live_dir
              : undefined;
          r = await runBrain(
            live ? ["deploy", "--live-dir", live] : ["deploy"],
          );
        } else if (name === "brain_corral") {
          confirm(a, "corral");
          const argv = Array.isArray(a.args)
            ? a.args.map((x) => String(x))
            : [];
          r = await runBrain([
            "corral",
            cleanArg(a.persona, "persona"),
            "--",
            ...argv,
          ]);
        } else if (name === "brain_checkpoint") {
          confirm(a, "checkpoint");
          r = await runBrain([
            "checkpoint",
            cleanArg(a.persona, "persona"),
            "-m",
            cleanArg(a.message, "message"),
          ]);
        } else {
          err(-32601, "unknown tool");
          continue;
        }
        r.ok ? ok(r.out) : err(-32603, r.out);
      } catch (e: any) {
        err(-32603, String(e?.message || e));
      }
    }
  }
});
