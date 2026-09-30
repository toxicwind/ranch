import { mdxPlugin } from "smithers-orchestrator/mdx-plugin";

mdxPlugin();

// Compat: @smithers-orchestrator/*@0.32.0 was built against effect@4.0.0-beta.102
// and imports "effect/unstable/*" subpaths. effect >= 4.0.0-rc.115 promoted those
// modules to stable subpaths ("effect/workflow", "effect/cluster", ...) and removed
// the unstable prefix. Re-export each stable module under its old specifier so the
// pinned packages keep working against the single overridden effect version
// (see overrides.effect in package.json). Note: Bun's onResolve does not fire for
// these bare specifiers in 1.4.2, so every known specifier is registered explicitly.
import { plugin } from "bun";

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
