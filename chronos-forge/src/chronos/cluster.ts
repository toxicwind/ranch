/**
 * Mutation clusters and the MoE expert panel.
 *
 * A cluster is a complete, standalone patch plan. The coordinator applies
 * EXACTLY ONE per cycle. Experts write independently — they never read each
 * other's output before writing their own.
 */

export type ClusterId = 'A' | 'B' | 'C';

export interface Cluster {
  id: ClusterId;
  goal: string;
  files: string[];
  commands: string[];
  patchPlan: string;
  proof: { command: string; expectedExcerpt: string };
  rollback: string;
  risk: string;
  /** Populated by SYNTH. */
  score?: ClusterScore;
}

export interface ClusterScore {
  /** 1 command, observable excerpt. */
  proofability: number;
  /** Smallest change that unblocks the next cycle. */
  locality: number;
  /** Doesn't break tests / adds guardrails with evidence. */
  nonRegression: number;
  total: number;
}

export const ROLE_NAMES = [
  'EXHUMER',
  'CARTOGRAPHER',
  'OPERATOR',
  'SURGEON',
  'SYNTH',
  'COORD',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export interface ExpertOutput {
  role: RoleName;
  cycle: number;
  artifact: string;
  clusters: Cluster[];
  /** Pseudoembedding tokens for large evidence bodies. */
  peRefs: string[];
  writtenUtc: string;
}

export interface RoleSpec {
  name: RoleName;
  mandate: string;
  artifact: string;
  readsRepo: boolean;
  editsRepo: boolean;
}

export const ROLE_SPECS: Record<Exclude<RoleName, 'COORD'>, RoleSpec> = {
  EXHUMER: {
    name: 'EXHUMER',
    mandate:
      'Find entropy: brittle constants, hardcoded IDs/paths, suspicious env reads, unconditional network calls. Locate the top hot files by churn + warnings + stack traces.',
    artifact: 'EXHUMER_REPORT.md',
    readsRepo: true,
    editsRepo: false,
  },
  CARTOGRAPHER: {
    name: 'CARTOGRAPHER',
    mandate:
      'Build the entrypoint graph (CLI -> main -> routers -> handlers -> IO), map config load order, env var precedence, and default fallbacks.',
    artifact: 'CARTO_MAP.md',
    readsRepo: true,
    editsRepo: false,
  },
  OPERATOR: {
    name: 'OPERATOR',
    mandate:
      'Produce minimal repro commands, smoke tests, fast lint/compile checks, and a runtime/proc/port snapshot if a service runs.',
    artifact: 'OPERATOR_PROOFPLAN.md',
    readsRepo: true,
    editsRepo: false,
  },
  SURGEON: {
    name: 'SURGEON',
    mandate:
      'Write competing clusters A/B/C, each standalone with target files, exact patch intent, exact proof commands, and git-based rollback only.',
    artifact: 'SURGEON_CLUSTERS.md',
    readsRepo: true,
    editsRepo: false,
  },
  SYNTH: {
    name: 'SYNTH',
    mandate:
      'Router only, no edits. Score A/B/C and choose exactly one WINNER, plus the proof gate.',
    artifact: 'AGGREGATE.md',
    readsRepo: true,
    editsRepo: false,
  },
};

/** SYNTH scoring. Higher is better; all inputs are 0..5. */
export function scoreCluster(c: Cluster): ClusterScore {
  const proofability = c.proof?.command ? 4 : 0;
  const locality = Math.max(0, 5 - Math.floor(c.files.length / 2));
  const nonRegression = c.rollback ? 3 : 0;
  return {
    proofability,
    locality,
    nonRegression,
    total: proofability + locality + nonRegression,
  };
}

/** Pick exactly one winner. Ties break toward the smaller blast radius. */
export function selectWinner(clusters: Cluster[]): Cluster | null {
  if (clusters.length === 0) return null;
  const scored = clusters.map((c) => ({ c, s: scoreCluster(c) }));
  scored.sort((a, b) => b.s.total - a.s.total || a.c.files.length - b.c.files.length);
  return scored[0].c;
}
