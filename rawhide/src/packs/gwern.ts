import type { SkillRulePack, Rule, LintIssue } from "../types.js";
import { offsetToLineCol } from "../engine.js";

const SLOP = /\b(delve|tapestry|landscape|leverage|harness|utilize|robust|seamless|paradigm|unlock|game-changer|not just .{1,40} but)\b/gi;
const HEDGE = /\b(may|might|could potentially|it seems that|arguably|possibly|perhaps|it is possible that|it could be argued)\b/gi;
const WORD_LIMIT = 75;

function issuesFromRegex(regex: RegExp, text: string, ruleId: string, messageFn: (match: string) => string, pack: string, suggestion?: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const re = new RegExp(regex.source, regex.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const { line, column } = offsetToLineCol(text, m.index, []);
    issues.push({ ruleId, message: messageFn(m[0]), severity: "warn", line, column, length: m[0].length, pack, suggestion });
  }
  return issues;
}

const rules: Rule[] = [
  { id: "gwern.slop", pack: "gwern", check: (ctx) => ctx.inCodeBlock ? [] : issuesFromRegex(SLOP, ctx.text, "gwern.slop", (m) => `anti-slop: "${m}" — replace with concrete mechanism`, "gwern", "State the specific action, property, or measured result.") },
  { id: "gwern.hedge", pack: "gwern", check: (ctx) => ctx.inCodeBlock ? [] : issuesFromRegex(HEDGE, ctx.text, "gwern.hedge", (m) => `hedge: "${m}" — unhedged declarative preferred (Kesselman calibration)`, "gwern", "State the claim directly or mark confidence explicitly.") },
  {
    id: "gwern.dense-75", pack: "gwern",
    check: (ctx) => {
      const issues: LintIssue[] = [];
      if (ctx.inCodeBlock) return issues;
      ctx.sentences.forEach((s, i) => {
        const words = s.split(/\s+/).filter(Boolean).length;
        if (words > WORD_LIMIT) issues.push({ ruleId: "gwern.dense-75", message: `sentence ${i + 1} is ${words} words (target ≤${WORD_LIMIT} dense prose)`, severity: "warn", line: 1, column: 1, length: s.length, pack: "gwern", suggestion: "Split or compress. Prefer ventilated prose: one idea per sentence." });
      });
      return issues;
    },
  },
];

const pack: SkillRulePack = {
  name: "gwern",
  description: "Gwernian epistemic scales, 75-word dense prose, anti-slop + hedge patterns, markdown-aware (tables/code/headings skipped)",
  rules,
  defaultSeverity: "warn",
};
export default pack;
