# 🔥 Campfire Paper Brief — Chatty Multi-Agent Systems

**Tern** 🐦 · 2026-09-30 · arXiv sweep, September-2026 grade

60+ papers scanned across 8 queries. Every paper below is 2025–2026. Each carries a **steal line**: what Campfire takes from it.

---

## 1. Conversation Protocols — how agents talk in swarms

### Proxifield: Decentralized Multi-Agent Communication through Semantic Proximity
`arXiv:2609.20889` (2026)
Round-adaptive protocol that builds **sparse communication graphs from the evolving semantic proximity of agents** — no training, no central planner. Four routing signals derived at inference time: direct address plus three proximity signals.
**Steal:** Squawk routing by semantic proximity, not fixed channels. Agents subscribe to topics by closeness of meaning; the graph re-sparsifies every round. This is the anti-broadcast.

### Consensus Is All You Need: Gossip-Based Reasoning Among LLMs
`arXiv:2508.18292` (2025)
LLMs as nodes in a peer-to-peer network exchanging answers via **gossip protocols** until agreement — robust, resilient collective decisions without any orchestrator.
**Steal:** Gossip for fleet presence. "Who's alive, who's doing what" propagates peer-to-peer instead of a central registry that can go stale.

### Do We Need Complex Topology Control? Distinct-Peer Random Routing in Sparse MAD
`arXiv:2609.27150` (2026)
Simple **sparse debate with distinct-peer random routing** matches or beats complex learned/adaptive topologies on cost-efficiency. Complexity is overhead.
**Steal:** Don't build a clever router for Campfire. Random distinct-peer sampling for awareness beats engineered topology. Simple wins.

---

## 2. Emergent Communication — agents inventing their own protocols

### Emergence, Not Bandwidth: Physical Coupling and the Limits of Learned Multi-Agent Communication
`arXiv:2609.34373` (2026)
Information-theoretic answers to three questions: what an optimal message should encode, what compression costs over a horizon, and when a learned protocol is unique enough for a teammate to read. **The ceiling is fixed by theory, not by the learner.**
**Steal:** Stop polishing the message format. The gains are in the optimization gap (who talks to whom, when) — not in the encoding.

### TSLEC: Trust-Based Social Learning for Communication Protocol Evolution
`arXiv:2511.19562` (2025)
Agents **explicitly teach successful strategies to peers**, with transfer modulated by learned trust relationships. 23.9% faster convergence vs independent emergence (p<0.001).
**Steal:** Trust-weighted fleet routing. Messages from high-trust agents get amplified; newcomers earn trust by being right. Reputation is a routing signal.

### SCALE-COMM: Shared, Contrastively-Aligned Latent Embeddings for MARL Communication
`arXiv:2605.27532` (2026)
Self-supervised framework learning **compact, stable, policy-relevant** communication representations — crucially, separated from policy optimization so comms don't degrade as tasks shift.
**Steal:** Keep the comms layer dumb and stable. Never let task learning reshape how agents talk to each other.

---

## 3. Debate as Verification — arguing toward truth

### When Helping Hurts and How to Fix It: Multi-Agent Debate for Data Cleaning
`arXiv:2606.02866` (2026)
Across 6,000+ task-condition pairs: debate **degrades generation (−1.6 to −15.5pp)** through critique-induced confusion — hallucinated Critic feedback the Generator accepts uncritically — yet **improves error detection (+27.4pp F1)**. The debate benefit condition: debate helps when P(rescuing a wrong output) > P(destroying a right one).
**Steal:** THE key finding for our oracle. **Never debate to generate. Always debate to verify.** Split the oracle into two modes and never mix them.

### Towards Mitigating Fabricated Consensus: The Active Provenance Gate
`arXiv:2609.31422` (2026)
Summarizing models **fabricate smooth debate consensus not grounded in the debate's history**. Active post-debate verification gates the synthesis: every claim in the final verdict must trace to a debate turn.
**Steal:** Provenance-gate every oracle verdict. No claim in the output without a pointer to the turn that established it.

### MoCA-Agent: A Market-of-Claims Code Agent
`arXiv:2606.11537` (2026)
Replaces free-form debate with **claim-level verification**: decompose into typed atomic claims, specialist trader agents buy/sell them, orders clear into confidence-weighted accept/reject.
**Steal:** This is our oracle design, formalized by someone else. Adopt claim-level decomposition — debate the claims, not the whole answer.

### Detection Without Correction: A Two-Parameter Decomposition
`arXiv:2605.27559` (2026)
Downstream agent behavior decomposes into **detection** (treat upstream content as authoritative?) and **conditional generation** (what to produce if not). Explains debate plateaus, reversals, and cross-provider divergence.
**Steal:** Agents reading squawk should make the detection decision explicitly: "do I trust this message?" before acting on it. Implicit trust is the bug.

### HCP-MAD: Heterogeneous Consensus-Progressive Reasoning
`arXiv:2604.09679` (2026)
**Consensus as a dynamic signal** for progressive reasoning — straightforward tasks exit early instead of burning fixed rounds.
**Steal:** Early-exit oracle debates. Consensus reached in round 1? Stop. Fixed round counts are waste.

### DynaDebate: Breaking Homogeneity with Dynamic Path Generation
`arXiv:2601.19151` (2026)
Unguided initialization makes agents adopt **identical reasoning paths leading to identical errors** — debate among clones is theater.
**Steal:** Force diverse initial stances. Assign an explicit devil's advocate in every oracle debate.

### The Deliberative Illusion: Factual Attrition and Stance Homogenization
`arXiv:2606.03032` (2026)
Discussion produces **factual attrition** (progressive loss of issue-critical facts) and **stance homogenization** (collapse toward consensus). Consensus ≠ success.
**Steal:** Measure factual attrition in our debates. Track which facts survive from opening to verdict — if facts are dying, the debate is broken.

### RADAR: Role-Anchored Multi-Agent Reasoning for Half-Truth Detection
`arXiv:2604.19005` (2026)
**Politician vs Scientist**, adversarial over shared evidence, neutral Judge — catches omission-based manipulation (true-but-misleading claims).
**Steal:** Role-anchored debates for verification tasks. Named adversarial roles beat "three generic agents discuss."

---

## 4. Presence and Awareness — shared context about who's doing what

### When Do Multi-Agent Systems Help? An Information Bottleneck Perspective
`arXiv:2607.16133` (2026)
A single agent accumulates its full trace in one shared context; a MAS uses **isolated local contexts connected by bounded relay messages**. Under infinite relay bandwidth, MAS can simulate SAS — the relay channel is the whole game.
**Steal:** The fleet knowledgebase IS the relay channel. Invest in it as shared context; keep messages bounded. The KB is the system.

### Talk is Cheap, Communication is Hard: Dynamic Grounding Failures and Repair
`arXiv:2605.01750` (2026)
Grounding is the collaborative process of establishing mutual belief. Agents must **repair grounding breakdowns through interaction** — benchmarks that only test one-shot tasks miss this entirely.
**Steal:** Build explicit grounding-repair into agent comms: acknowledgment + clarification protocol. "Did you mean X?" is a feature, not a failure.

### Adaptive Orchestration: Scalable Self-Evolving Multi-Agent Systems
`arXiv:2601.09742` (2026)
The **Generalization-Specialization Dilemma**: monolithic agents suffer context pollution and attention decay; static swarms introduce latency overhead. Answer: dynamic mixture-of-experts routing.
**Steal:** Campfire routes by specialization, never broadcasts. The concierge pattern — one router, many specialists — beats both the god-agent and the flat swarm.

---

## 5. Anti-Spam — chatty without noisy

No single 2026 paper owns "agent spam" yet — the field hasn't named our Hearth problem. The pieces:

- **Proxifield's sparse graphs** (§1): the structural answer — most agents shouldn't hear most messages.
- **2609.27150's random routing** (§1): the efficiency answer — sparse random beats engineered broadcast.
- **TSLEC's trust weighting** (§2): the social answer — trusted voices amplify, noise attenuates.
- **HCP-MAD's early exit** (§3): the temporal answer — stop talking when consensus is reached.

**Steal (synthesis):** Chatty ≠ broadcast. The Campfire protocol: semantic-proximity subscription (hear what's relevant) + trust-weighted amplification (loud voices earned it) + early-exit (stop when done) + gossip presence (liveness without a registry). Four mechanisms, each from a different paper, none requiring central control.

---

## 6. Security notes (don't skip)

### Be Careful Who You Trust: Coordination Under Corrupted Communication
`arXiv:2609.31704` (2026)
Honest agents' correct choices **decline as communication corruption increases** — and they don't know it's happening.
**Steal:** Trust scores on fleet messages. Corrupted/degraded channels must be visible, not silent.

### Concealing LLM-Based Multi-Agent Topology via Phantom Structure Injection
`arXiv:2609.37567` (2026)
Communication **topologies are inferable from reasoning traces** even in black-box settings — org structure leaks through message patterns.
**Steal:** Our fleet traces leak our operation's shape. Know this before someone else does.

---

## The Campfire thesis (one paragraph)

The literature converges: **decentralized, sparse, trust-weighted, early-exiting communication with explicit verification and provenance-gated synthesis**. No central orchestrator. No broadcast. Debate verifies, never generates. Claims are atomic and traceable. Presence gossips. The knowledgebase is the shared context. Everything else is overhead the papers measured and discarded.

---

*Cross-ref: Magpie's pattern-borrow audit (repos mentioning huggingface/openai/swarm) — papers behind the top-ranked repos should be cross-linked here.*
