import { EXPECTED } from "./taskDefinition";

export function scoreResponse(text: string): { score: number; parts: { a: boolean; b: boolean; c: boolean }; parsed: any } {
  // Strip markdown fences if the model wrapped the JSON.
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  // Find the first {...} block.
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return { score: 0, parts: { a: false, b: false, c: false }, parsed: null };
  let parsed: any = null;
  try { parsed = JSON.parse(t.slice(start, end + 1)); } catch { return { score: 0, parts: { a: false, b: false, c: false }, parsed: null }; }
  const aOk = Number(parsed.part_a) === EXPECTED.part_a;
  const bOk = Number(parsed.part_b) === EXPECTED.part_b;
  const cOk = String(parsed.part_c).toUpperCase() === EXPECTED.part_c;
  const score = (aOk ? 1 : 0) + (bOk ? 1 : 0) + (cOk ? 1 : 0);
  return { score, parts: { a: aOk, b: bOk, c: cOk }, parsed };
}
