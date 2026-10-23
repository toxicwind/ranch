# Rawhide

One engine. Multiple maximal rule packs. Skills are the extension point.

Airspeak is one pack (the STE mechanical lineage), not a second extension.

## Architecture

- `src/engine.ts` — glob, sentence split, markdown-aware issue collector
- `src/packs/gwern.ts` — default: slop, hedge, epistemic, 75-word, markdown-aware
- `src/packs/airspeak.ts` — airspeak pack (STE lineage absorbed)
- `src/packs/epistemic.ts` — optional Kesselman calibration
- `skills/*/SKILL.md` — rule packs as skills

## Usage

```bash
RAWHIDE_PACKS=gwern node --experimental-strip-types src/index.ts .
RAWHIDE_PACKS=gwern,airspeak node --experimental-strip-types src/index.ts ./docs
```

Default pack is `gwern`. Airspeak is optional.

## What is maximized

| From     | Keep / elevate                                      | Drop                          |
|----------|-----------------------------------------------------|-------------------------------|
| Rawhide  | Gwernian scales, 75-word, markdown-aware, anti-slop | Hard-coded single rules file  |
| Airspeak | STE banned vocab, phrasal, sentence split, em-dash, contractions | Separate extension, 20-word hard default |
| Skills   | Packs as skills; enable via env or discovery        | Mode flag switching monoliths |

Full merge: rawhide engine owns the airspeak pack.
