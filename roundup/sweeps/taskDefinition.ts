export const TASK = `You are debugging a hatch cell watchdog. Answer with ONLY a JSON object, no markdown, no prose.

Given this process tree (pid, ppid, state, comm):
[
  {"pid": 100, "ppid": 1, "state": "S", "comm": "hatch-execd"},
  {"pid": 101, "ppid": 100, "state": "S", "comm": "swarm-watchdog"},
  {"pid": 102, "ppid": 101, "state": "T", "comm": "worker"},
  {"pid": 103, "ppid": 101, "state": "S", "comm": "worker"},
  {"pid": 104, "ppid": 100, "state": "S", "comm": "squawk-relay"},
  {"pid": 105, "ppid": 104, "state": "T", "comm": "feed-drain"}
]

Part A: count the TOTAL number of descendants of pid 100 (all transitive children, not just direct).
Part B: the watchdog freezes (SIGSTOP) every descendant whose state is "T". After that, how many processes are in state "T"?
Part C: the load-audit rule says "keep the cell under ~4x cores (load1 < 8) before big fan-outs" on a 2-vCPU cell. If load1 is 6.5, is a big fan-out SAFE or UNSAFE?

Respond with EXACTLY this JSON shape (numbers as integers, string as uppercase):
{"part_a": <int>, "part_b": <int>, "part_c": "<SAFE|UNSAFE>"}`;

// Ground truth, computed by hand:
//   Part A: descendants of 100 = 101,102,103,104,105 = 5
//   Part B: T-state after freeze = 102,105 = 2 (they were already T; freezing a T-state proc keeps it T)
//   Part C: load1=6.5 < 8 => SAFE
export const EXPECTED = { part_a: 5, part_b: 2, part_c: "SAFE" };
