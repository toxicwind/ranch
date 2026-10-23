import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { loadPacks, lintFile } from "./engine.js";

const packsEnv = process.env.RAWHIDE_PACKS || "gwern";
const activePacks = packsEnv.split(",").map((s) => s.trim()).filter(Boolean);

export default function rawhideExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify(`rawhide loaded (packs: ${activePacks.join(", ")})`, "info");
  });

  // Hook markdown writes the way airspeak did
  const check = async (path: string, content: string) => {
    if (!/\.(md|mdx|markdown)$/i.test(path) && !/README|CHANGELOG|RELEASE/i.test(path)) return;
    try {
      const packs = await loadPacks(activePacks);
      const issues = await lintFile(path, content, packs);
      if (issues.length) {
        const summary = issues.slice(0, 8).map(i => `- [${i.ruleId}] ${i.message}`).join("\n");
        return `\n\n## rawhide (packs: ${activePacks.join(", ")}) — ${issues.length} issue(s)\n${summary}${issues.length > 8 ? "\n..." : ""}`;
      }
    } catch (err) {
      console.error("rawhide check failed", err);
    }
    return "";
  };

  // Annotate tool results for write/edit when possible
  pi.on("tool_result", async (event, ctx) => {
    // event shape varies; best-effort annotation path
    const path = (event as any)?.toolCall?.arguments?.path || (event as any)?.path;
    const content = (event as any)?.toolCall?.arguments?.content || (event as any)?.content;
    if (path && content && typeof content === "string") {
      const note = await check(path, content);
      if (note && (event as any).result) {
        (event as any).result.content = ((event as any).result.content || "") + note;
      }
    }
  });
}
