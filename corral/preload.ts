import { mdxPlugin } from "smithers-orchestrator/mdx-plugin";

mdxPlugin();

// Compat: @smithers-orchestrator/*@0.32.0 was built against effect@4.0.0-beta.102
// and imports "effect/unstable/*" subpaths. effect >= 4.0.0-rc.115 promoted those
// modules to stable subpaths ("effect/workflow", "effect/cluster", ...) and removed
// the unstable prefix.
//
// The shims below re-export each stable module under its old specifier — but ONLY
// when the installed effect actually lacks the `effect/unstable/*` subpaths.
// When effect still ships them natively (beta.x, per overrides.effect in
// package.json), registering the shims would shadow the working native modules
// with broken re-exports from the nonexistent stable paths (verified 2026-10-02:
// `effect/workflow/WorkflowEngine` does not resolve under 4.0.0-beta.102, while
// `effect/unstable/workflow` does). So we probe native resolution first and skip
// the shims entirely when it succeeds. (oracle-settle lane.)
import { plugin } from "bun";
import { createRequire } from "node:module";

const UNSTABLE_PREFIX = "effect/unstable/";
// Every "effect/unstable/*" specifier statically imported by @smithers-orchestrator/*.
const UNSTABLE_SHIMS = [
  "cluster",
  "cluster/Entity",
  "cluster/MessageStorage",
  "cluster/RunnerHealth",
  "cluster/Runners",
  "cluster/RunnerStorage",
  "cluster/Sharding",
  "cluster/ShardingConfig",
  "cluster/SingleRunner",
  "http/FetchHttpClient",
  "observability/Otlp",
  "process/ChildProcess",
  "process/ChildProcessSpawner",
  "reactivity/Reactivity",
  "rpc/Rpc",
  "rpc/RpcGroup",
  "sql/SqlClient",
  "sql/SqlError",
  "sql/Statement",
  "workflow",
  "workflow/Activity",
  "workflow/DurableDeferred",
  "workflow/Workflow",
  "workflow/WorkflowEngine",
];

function unstableResolvesNatively(): boolean {
  try {
    createRequire(import.meta.url).resolve(UNSTABLE_PREFIX + "workflow");
    return true;
  } catch {
    return false;
  }
}

// Note: Bun's onResolve does not fire for these bare specifiers in 1.4.2,
// so every known specifier is registered explicitly when shimming.
if (!unstableResolvesNatively()) {
  plugin({
    name: "effect-unstable-compat",
    setup(build) {
      for (const rest of UNSTABLE_SHIMS) {
        build.module(UNSTABLE_PREFIX + rest, async () => {
          const mod = await import("effect/" + rest);
          return { loader: "object", exports: { ...mod } };
        });
      }
    },
  });
}
