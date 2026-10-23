export type Severity = "warn" | "block" | "info";
export type Confidence = "certain" | "high" | "medium" | "low";

export interface LintIssue {
  ruleId: string;
  message: string;
  severity: Severity;
  line: number;
  column: number;
  length: number;
  suggestion?: string;
  pack: string;
  confidence?: Confidence;
}

export interface Rule {
  id: string;
  pack: string;
  check: (ctx: RuleContext) => LintIssue[];
  enabledByDefault?: boolean;
}

export interface RuleContext {
  text: string;
  sentences: string[];
  isMarkdown: boolean;
  inCodeBlock: boolean;
  inTable: boolean;
  inHeading: boolean;
  filePath: string;
  lineOffsets: number[];
}

export interface SkillRulePack {
  name: string;
  description: string;
  rules: Rule[];
  defaultSeverity: Severity;
}

export interface ExtensionAPI {
  name: string;
  onWrite?: (file: string, content: string) => Promise<LintIssue[]>;
  onLint?: (pattern: string) => Promise<LintIssue[]>;
}
