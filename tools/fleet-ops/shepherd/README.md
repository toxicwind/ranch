# shepherd_truth.py — Vesper evening-shepherd truth reconciliation

Runs ON yote. Reconciles FOUR sources for every daemon/lane — (1) pitchfork
list, (2) live ps, (3) ss ports, (4) HTTP health — and classifies each as
VERIFIED-LIVE / TRACKING-LOSS / GHOST / ZOMBIE / STOPPED-CONFIRMED.

First run (2026-10-19, fleet msg 1791911248761): 6/6 bidders VERIFIED-LIVE;
oracle-market TRACKING-LOSS (pitchfork errored, oracle_loop.py alive);
herd VERIFIED-LIVE post de-herd. Report: /home/toxic/kite/vesper-20261019T1530-shepherd/TRUTH-REPORT-v1.txt.

Known v1 bug: the `flock` ps-pattern over-matches paths containing the
substring (e.g. flock-nim paths inside other processes). Fix: match the
supervisor unit name (pitchfork daemon id) or exact binary path, not the
bare substring. Do NOT claim a ghost on a substring match.
