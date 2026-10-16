import type { SkillRulePack, Rule, LintIssue } from "../types.js";
import { offsetToLineCol } from "../engine.js";

// Airspeak pack: the STE mechanical lineage absorbed into rawhide.
// Not a separate extension. One engine, this pack supplies the airspeak rules.

const PHRASAL = new Map<string, string>([
  ["utilize", "use"],
  ["leverage", "use"],
  ["in order to", "to"],
  ["due to the fact that", "because"],
  ["prior to", "before"],
  ["in the event of", "if"],
  ["facilitate", "help"],
  ["commence", "start"],
]);

const BANNED = /\b(utilize|leverage|facilitate|commence|prior to|in the event of|in order to)\b/gi;
const EM_DASH = /—/g;
const SEMICOLON = /;/g;
const CONTRACTION = /\b(don't|doesn't|isn't|aren't|won't|can't|couldn't|wouldn't|shouldn't|it's|that's|there's)\b/gi;

function collectMatches(regex: RegExp, text: string, ruleId: string, msg: (m: string) => string, pack: string, suggestion?: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const re = new RegExp(regex.source, regex.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const { line, column } = offsetToLineCol(text, m.index, []);
    issues.push({ ruleId, message: msg(m[0]), severity: "warn", line, column, length: m[0].length, pack, suggestion });
  }
  return issues;
}

const rules: Rule[] = [
  {
    id: "airspeak.sentence-length",
    pack: "airspeak",
    check: (ctx) => {
      const issues: LintIssue[] = [];
      if (ctx.inCodeBlock) return issues;
      ctx.sentences.forEach((s, i) => {
        const words = s.split(/\s+/).filter(Boolean).length;
        const isProcedural = /^(press|remove|install|check|open|close|set|start|stop|verify|do|make)\b/i.test(s.trim());
        const limit = isProcedural ? 20 : 25;
        if (words > limit) {
          issues.push({
            ruleId: "airspeak.sentence-length",
            message: `airspeak/STE sentence ${i + 1} is ${words} words (max ${limit} for ${isProcedural ? "procedural" : "descriptive"})`,
            severity: "warn", line: 1, column: 1, length: s.length, pack: "airspeak",
            suggestion: "Split into one idea per sentence.",
          });
        }
      });
      return issues;
    },
  },
  {
    id: "airspeak.banned-vocab",
    pack: "airspeak",
    check: (ctx) => ctx.inCodeBlock ? [] : collectMatches(BANNED, ctx.text, "airspeak.banned-vocab", (m) => `airspeak banned/phrasal: "${m}"`, "airspeak", PHRASAL.get(m.toLowerCase()) ? `use "${PHRASAL.get(m.toLowerCase())}"` : "replace with approved simple form"),
  },
  {
    id: "airspeak.em-dash",
    pack: "airspeak",
    check: (ctx) => {
      if (ctx.inCodeBlock) return [];
      const matches = ctx.text.match(EM_DASH) || [];
      if (matches.length > 2) return [{ ruleId: "airspeak.em-dash", message: `${matches.length} em-dashes — airspeak prefers period or split`, severity: "warn", line: 1, column: 1, length: 1, pack: "airspeak", suggestion: "Replace with period or rewrite as two sentences." }];
      return [];
    },
  },
  {
    id: "airspeak.semicolon",
    pack: "airspeak",
    check: (ctx) => ctx.inCodeBlock ? [] : collectMatches(SEMICOLON, ctx.text, "airspeak.semicolon", () => "airspeak/STE 8.1: semicolon banned — use period or split", "airspeak", "Replace with period."),
  },
  {
    id: "airspeak.contraction",
    pack: "airspeak",
    check: (ctx) => ctx.inCodeBlock ? [] : collectMatches(CONTRACTION, ctx.text, "airspeak.contraction", (m) => `airspeak/STE 4.2: contraction "${m}" — write the full form`, "airspeak", "Expand (do not, does not, it is, etc.)."),
  },
];

const pack: SkillRulePack = {
  name: "airspeak",
  description: "Airspeak pack (STE lineage absorbed into rawhide engine). Short sentences (20 procedural / 25 descriptive), banned vocab + phrasal replacements, em-dash density, semicolon ban, contractions. Optional; not the default.",
  rules,
  defaultSeverity: "warn",
};

export default pack;
