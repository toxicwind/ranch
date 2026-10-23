# Vesper — 3 Tasks (2026-10-19, Kite direct lane)
Owner: Vesper (vesper bat, evening shepherd) — Kite's crew
Domain: evening shepherd duties / bidder verification / herd cutover closure
Live baseline 15:30 MDT: 6/6 bidders running (finch, forge, raccoon, scout, vesper, warden), hodos :25193 ok, gatehouse :25127 up 22h+, squawk-ws :25147 ping ok. Divergences already visible: pitchfork says oracle-market errored but oracle_loop.py is alive; estate/herd still "running" post de-herd; estate/flock stopped; :25100 llama-swap listening.

## Task 1 — Shepherd Truth Reconciliation (EXECUTING FIRST)
No more trusting one narrator. Build + run a shepherd audit that reconciles FOUR sources for every daemon/lane: (1) pitchfork list, (2) ps/ss live process+port, (3) HTTP health where applicable, (4) squawk/NATS presence + recent fleet activity.
Deliverable: truth table classifying each service as VERIFIED-LIVE / TRACKING-LOSS (pitchfork wrong) / GHOST (process alive, no consumers) / ZOMBIE (pitchfork running, nothing alive) / QUIET-LANE (no artifact movement).
Then: the wake protocol — quiet lanes get a direct nudge by name in their side chat, verification is artifact movement, not a reply. Event-driven design (inotify/NATS), no new timer poller.
Done when: script in ranch/estate tooling, first full report filed, every divergence named with evidence.

## Task 2 — Bidder Fleet Proof Under the New Model Chain
Finch re-cut the judge panel today (ranch 5dc1442: gpt-oss-120b + glm-5.3-flash lead, nemotron-super diversity) + reasoning budgets (765e07d) + bare-reasoning fallback (9ddec8f). Bidders restarted 15:02. The empty-response disease is still NOT proven cured — intake 2443 side-by-side is open.
Vesper (probe,verify) owns the proof: controlled intakes through each bidder, measure settle rate / empty-response rate / reasoning-token burn / latency, bidder path vs raw hodos path side-by-side. If empties persist, isolate the lane that mangles (bidder.py vs nimProxy vs corral/smithers) with evidence, not theory.
Done when: verification matrix filed, disease verdict is evidence-backed, any fix committed+pushed+remote-verified.

## Task 3 — Herd Cutover Closure + Smithers Ghost
De-herd was Oct 13: consumers repointed to hodos :25193, flock stopped. But estate/herd still runs in pitchfork, :25100 llama-swap still listens, model-guard historically proxied to herd. Separately: the ghost is isolated to smithers — live example 15:28 today, a corral/smithers run for scout/research-1792445323109 invoking nvidia/nemotron-3-ultra-550b-a55b, a model that failed the Oct 19 codegen bench and was demoted/EOL-adjacent.
Scope: ffs sweep all herd/:25100/local-model refs across ranch+estate+tau, classify keep/kill/consumer, trace smithers model-selection so ghost picks stop, consolidate everything to hodos. Do NOT kill herd until a verified hot-replacement path exists.
Done when: reference map + config fixes committed, smithers model source explained and fixed, cutover checklist verified live port-by-port.
