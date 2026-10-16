import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillRulePack, LintIssue, RuleContext } from "./types.js";

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z"])|\n{2,}/g;

export async function loadPacks(active: string[]): Promise<SkillRulePack[]> {
  const packs: SkillRulePack[] = [];
  for (const name of active) {
    try {
      const mod = await import(`./packs/${name}.js`);
      const pack = mod.default || mod.pack;
      if (pack && Array.isArray(pack.rules)) packs.push(pack);
    } catch (err) {
      console.error(`Failed to load pack ${name}:`, err);
    }
  }
  return packs;
}

export function splitSentences(text: string): string[] {
  return text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
}

export function buildLineOffsets(text: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

export function offsetToLineCol(text: string, offset: number, lineOffsets: number[]): { line: number; column: number } {
  let line = 1;
  for (let i = 0; i < lineOffsets.length; i++) {
    if (lineOffsets[i] > offset) { line = i; break; }
    line = i + 1;
  }
  const lineStart = lineOffsets[line - 1] || 0;
  return { line, column: offset - lineStart + 1 };
}

export async function lintFile(filePath: string, content: string, packs: SkillRulePack[]): Promise<LintIssue[]> {
  const sentences = splitSentences(content);
  const lineOffsets = buildLineOffsets(content);
  const isMarkdown = /\.(md|mdx|markdown)$/i.test(filePath);
  const issues: LintIssue[] = [];
  for (const pack of packs) {
    for (const rule of pack.rules) {
      const baseCtx: RuleContext = {
        text: content, sentences, isMarkdown,
        inCodeBlock: false, inTable: false, inHeading: false,
        filePath, lineOffsets,
      };
      try {
        const found = rule.check(baseCtx);
        issues.push(...found);
      } catch (err) {
        console.error(`Rule ${rule.id} failed:`, err);
      }
    }
  }
  return issues;
}

export async function lintGlob(pattern: string, packNames: string[]): Promise<LintIssue[]> {
  const packs = await loadPacks(packNames);
  const issues: LintIssue[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") await walk(full);
      } else if (/\.(md|mdx|markdown)$/i.test(entry.name)) {
        const content = await readFile(full, "utf8");
        issues.push(...(await lintFile(full, content, packs)));
      }
    }
  }
  await walk(pattern === "**/*" ? process.cwd() : pattern.replace(/\/\*\*$/, "") || ".");
  return issues;
}
