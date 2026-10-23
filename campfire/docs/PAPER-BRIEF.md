# 📄 Campfire Paper Brief

**Researched:** 2026-09-30 by PaperFinder (ember's pack)
**Corpus:** arXiv, 2025–2026 preprints (~150 papers scanned, 10 full abstracts read)
**Method note:** The paper-search skill's OpenAlex racer returned popularity-ranked
classics (1989–2023), so PaperFinder ran date-sorted arXiv queries directly.
alphaXiv timed out on every attempt — noted honestly, not silently dropped.

## Top 5 papers

### 1. Speak or Stay Silent: Context-Aware Turn-Taking in Multi-Party Dialogue
*Bhagtani et al., arXiv 2026-03-12 — https://arxiv.org/abs/2603.11409*

Voice assistants treat every pause as an invitation to speak — disruptive
in multi-party settings. Eight frontier LLMs all fail turn-taking under
zero-shot prompting; fine-tuning with reasoning traces lifts accuracy up
to 23 points. **Turn-taking is not an emergent capability; it must be
explicitly trained.**

**→ Campfire:** The SPEAK/STAY-SILENT gate ([room.ts](../src/room.ts)) is
the single most important component. Don't assume a good prompt gives
turn-taking judgment — build the explicit gate and calibrate it on real
chat history.

### 2. Humanlike Multi-user Agent (HUMA): A Deceptively Human AI Facilitator
*Jacniacki & Carmona Serrat, arXiv 2025-11-21 — https://arxiv.org/abs/2511.17315*

An LLM facilitator for asynchronous multi-party group chats: event-driven,
three components (Router → Action Agent → Reflection), simulated human-like
response timing. Participants classified HUMA vs human managers at
near-chance rates.

**→ Campfire:** Split decide / speak / reflect into three roles. Be
event-driven (react, never poll). Add a small jittered delay before
posting — instant replies read as botty, a few seconds read as thinking.

### 3. Speak for Me: Situational Awareness for Meeting Participation
*Khan et al., arXiv 2026-09-03 — https://arxiv.org/abs/2609.03923*

Prompt-only LLM delegates stayed silent on **51.4%** of real talking
opportunities. The failure mode in groups is *omission*, not interruption.
Their CAPA architecture (Perceiver → Predictor → Controller → Generator)
cut silence to 2.5% via persistent meeting state.

**→ Campfire:** Keep persistent per-channel state (who's here, open topics,
unanswered questions, who's quiet). Hunt *missed opportunities* — a
newcomer ignored, a question dying — harder than suppressing over-eagerness.

### 4. Multi-Agent Systems Shape Social Norms for Prosocial Behavior
*Feng et al., arXiv 2026-02-07 — https://arxiv.org/abs/2602.07433*

Agent packs establish "virtual social norms" that shift real behavior.
In-group framing amplifies the effect.

**→ Campfire:** Every welcome, praise, and thank-you is a norm broadcast
("we greet newcomers here"), not just politeness. Stay in-group: "one of
the pack," not a moderator voice from above.

### 5. Behavior is Not Enough: Measuring Social Norm Emergence
*Muralidharan et al., arXiv 2026-09-22 — https://arxiv.org/abs/2609.26481*

Behavioral convergence ≠ norm emergence. Eliciting expectations *increases*
cooperative contributions.

**→ Campfire:** Periodically state the pack's norms out loud ("we narrate
wins here") — expectation-elicitation measurably raises cooperation. In
evals, probe expectations, not just behavior.

## Design principles (each traced to a paper)

1. **Turn-taking is a trained gate, not a prompt.** Explicit SPEAK/STAY-SILENT
   step; calibrate on real history. *(→ 2603.11409)*
2. **Split decide / speak / reflect.** Cheap router → generator → reflection
   pass. Never one monolithic "respond." *(→ 2511.17315; 2609.03923)*
3. **Persistent per-channel state.** Updated on every message; the
   speak-decision reads the state, not the raw transcript. *(→ 2609.03923)*
4. **Optimize against missed opportunities.** "Newcomer ignored" and
   "question died" hurt more than "posted something slightly unnecessary."
   *(→ 2609.03923)*
5. **Event-driven with human-like latency.** React to events; jittered
   delay before posting. *(→ 2511.17315)*
6. **Every prosocial move is a norm broadcast.** Welcomes teach the group
   the standard. *(→ 2602.07433)*
7. **Stay in-group.** Anchored persona, one of the pack. *(→ 2602.07433)*
8. **Infer local norms from transcript.** Read demonstrated norms before
   acting. *(→ LoSoNA, 2606.14600)*
9. **Say the norms out loud periodically.** Elicitation raises cooperation.
   *(→ 2609.26481)*
10. **Measure norms by expectations, not behavior.** *(→ 2609.26481)*
11. **Never read silence as agreement.** Quiet consensus is unverified.
    *(→ Pluralistic Ignorance, 2608.02758)*

## What this changed in Campfire's code

- [room.ts](../src/room.ts) — the explicit SPEAK/STAY-SILENT gate (principle 1)
- [brain.ts](../src/brain.ts) — decide/speak split; persistent state (principles 2, 3)
- [greeter.ts](../src/greeter.ts), [nudger.ts](../src/nudger.ts),
  [silence.ts](../src/silence.ts) — missed-opportunity hunting (principle 4)
- [poster.ts](../src/poster.ts) — jittered human-like delay added (principle 5)
- Welcome/celebration copy — phrased as norm broadcasts (principle 6)
- Kindling persona — in-group, not moderator (principle 7)

## Honest limits

- Acoustic/VAD machinery doesn't transfer (voice ≠ text).
- The donation study is one experiment — direction transfers, not effect sizes.
- Most "emergent norms" papers simulate closed societies; they inform eval
  thinking, not posting behavior.
- alphaXiv was unreachable; a re-run could surface more 2026 work.

---

*Full research: `/tmp/campfire-research/papers.md` (PaperFinder's raw findings)*
