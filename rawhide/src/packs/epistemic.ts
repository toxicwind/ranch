import type { SkillRulePack, Rule } from "../types.js";
const rules: Rule[] = [{ id: "epistemic.calibration", pack: "epistemic", check: () => [] }];
const pack: SkillRulePack = { name: "epistemic", description: "Kesselman-style calibration pack (optional). Explicit confidence scales over bare hedges.", rules, defaultSeverity: "info" };
export default pack;
