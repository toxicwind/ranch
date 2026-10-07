<div align="center">

# 🤠 Rawhide

**Untanned, unvarnished, slop-free prose linter and style engine for the Ranch.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?logo=bun)](https://bun.sh)
[![Tests](https://img.shields.io/badge/tests-7%20passed-brightgreen.svg)](tests/)
[![Lineage](https://img.shields.io/badge/lineage-airspeak%20%7C%20gwern-purple.svg)](#provenance--attribution)

</div>

---

## What is Rawhide?

**Rawhide** is an unhedged prose linter built for autonomous AI agents and technical documentation. It eliminates corporate boilerplate, spineless hedging, and AI stylistic tells while giving engineers the freedom to write rich, mathematically grounded, and aesthetically maximal markdown.

Upstream aerospace linters (like `airspeak`) enforced **ASD-STE100 Issue 9**—a 1980s aerospace standard designed for non-native English aircraft mechanics that capped sentences at 20 words, banned contractions, prohibited semicolons, and broke markdown lists.

Rawhide unblinds this constraint: it replaces mechanical word-choking with **epistemic calibration and aggressive anti-slop detection**.

---

## Airspeak vs. Rawhide

| Dimension | Airspeak (ASD-STE100) | Rawhide (Ranch / Gwernian) |
|---|---|---|
| **Sentence Length** | Hard cap at 20–25 words (flags lists & tables) | 65-word limit; strips bullet lists, headers & code |
| **Punctuation** | Bans semicolons (`;`) and em-dashes (`—`) | Welcomes semicolons and calibrated em-dashes |
| **Contractions** | Banned (`don't` → `do not`) | Permitted for natural technical flow |
| **AI Tells** | Basic vocabulary check | Deep pattern detection (`delve`, `tapestry`, `beacon`, `testament`, `game changer`) |
| **Hedging** | Ignores throat-clearing | Eliminates spineless hedging (`it is worth noting that`, `needless to say`) |
| **Probability** | Uncalibrated | Enforces Kesselman National Intelligence Estimate certainty scales |

---

## 30-Second Quickstart

```bash
# Run unit tests
bun test packages/rawhide/tests/

# Use directly in TypeScript / Bun
import { checkRawhide } from "@toxicwind/rawhide";

const issues = checkRawhide("We delve into this multifaceted tapestry to provide a seamless experience.");
console.log(issues);
// [
//   "[rawhide:slop] banned \"delve\" — AI tell; use inspect, examine, explore, or read",
//   "[rawhide:slop] banned \"multifaceted\" — pseudo-intellectual padding; name elements",
//   "[rawhide:slop] banned \"tapestry\" — AI tell; use system, architecture, or structure",
//   "[rawhide:slop] banned \"seamless\" — vague claim; state protocol or latency"
// ]
```

---

## Provenance & Attribution

Rawhide is developed with gratitude to the foundations that preceded it:

1. **Upstream Code Lineage**: Forked and modernized from [`donrami/airspeak`](https://github.com/donrami/airspeak) by Rami (original ASD-STE100 aerospace linting ruleset and Pi extension architecture).
2. **Style & Epistemics**: Grounded in [Gwern Branwen's Manual of Style](https://gwern.net/style-guide) ("classic style", unhedged assertions, and ventilated prose).
3. **Probability Standards**: Calibrated according to J. Kesselman's *Verbal Probability Expressions in National Intelligence Estimates* (2008).
4. **Linguistic Tell Research**: Informed by Cory Massaro's *Literary Non-Style in LLM-Generated Text* (arXiv:2607.17228, 2026) and Oh et al.'s *Science or Slop?* (arXiv:2610.00531, 2026).

---

## License

Apache-2.0. See [LICENSE](LICENSE) for details.
