/**
 * WebSIFT — Search -> Ingest -> Filter -> Transform, triggered by warnings.
 *
 * Trigger rule (no exceptions): if any command output contains "warning",
 * "deprecated", "error", "traceback", "panic", "segfault", or "invalid
 * option", a diagnostic pivot runs immediately and the exact message string
 * plus the top library/tool name is looked up. Three concrete fixes are
 * extracted: minimal, conservative, refactor.
 */

export const TRIGGER_PATTERN =
  /\b(warning|deprecated|error|traceback|panic|segfault|invalid option)\b/i;

export interface SiftTrigger {
  matched: string;
  line: string;
  lineNumber: number;
  /** Best-effort extraction of the offending tool/library token. */
  tool: string | null;
}

export interface SiftSource {
  title: string;
  url: string;
  date?: string;
}

export interface SiftResult {
  trigger: SiftTrigger;
  queries: string[];
  sources: SiftSource[];
  undatedSourceCount: number;
  fixes: Array<{ kind: 'minimal' | 'conservative' | 'refactor'; summary: string }>;
}

const TOKEN_PATTERN = /([a-z0-9._-]+\.(?:py|js|ts|tsx|go|rs|c|h|cpp))\b/i;

/** Scan command output for the first trigger-worthy line. */
export function detectTrigger(output: string): SiftTrigger | null {
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = TRIGGER_PATTERN.exec(lines[i]);
    if (m) {
      return {
        matched: m[1].toLowerCase(),
        line: lines[i].trim().slice(0, 500),
        lineNumber: i + 1,
        tool: extractTool(lines[i]),
      };
    }
  }
  return null;
}

function extractTool(line: string): string | null {
  const file = TOKEN_PATTERN.exec(line);
  if (file) return file[1];
  const code = /\b([A-Z]{2,5}\d{3,5})\b/.exec(line); // e.g. TS2304, E501
  if (code) return code[1];
  return null;
}

/** Build the exact query strings to run against a search source. */
export function buildQueries(trigger: SiftTrigger, framework?: string): string[] {
  const base = trigger.line.slice(0, 160);
  const q: string[] = [`${base} ${framework ?? ''}`.trim()];
  if (trigger.tool) q.push(`${trigger.tool} ${trigger.matched} fix`);
  if (framework) q.push(`${framework} official docs ${trigger.matched}`);
  return q;
}

/**
 * Shape a diagnostic pivot. The three fix kinds are always present so the
 * cycle can choose the smallest working win.
 */
export function diagnosticPivot(
  trigger: SiftTrigger,
  sources: SiftSource[] = [],
): SiftResult {
  return {
    trigger,
    queries: buildQueries(trigger),
    sources,
    undatedSourceCount: sources.filter((s) => !s.date).length,
    fixes: [
      { kind: 'minimal', summary: 'Smallest working win — silence or fix the single cause.' },
      { kind: 'conservative', summary: 'Guardrail + targeted fix, keeps blast radius minimal.' },
      { kind: 'refactor', summary: 'Remove the brittle constant/config that caused it.' },
    ],
  };
}
