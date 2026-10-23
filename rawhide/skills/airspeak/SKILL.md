---
name: airspeak
description: Airspeak pack for rawhide engine. STE mechanical lineage (short sentences, banned vocab, phrasal verbs, em-dash, contractions) absorbed as one composable rule module. Optional.
---

# Airspeak Pack

Airspeak is not a separate extension. It is this rule pack inside the rawhide engine.

- Sentence length: 20 words procedural, 25 descriptive.
- Banned/phrasal: utilize → use, leverage → use, in order to → to, etc.
- Em-dash density, semicolon ban, contractions (STE 4.2).
- Warn by default.

Load with `RAWHIDE_PACKS=gwern,airspeak`.
Default remains gwern (dense, unhedged, anti-slop).
