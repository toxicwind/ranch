/**
 * Event framing — "stdout is the transport".
 *
 * Every actionable line emitted by the backplane MUST be exactly:
 *
 *   [CHR|<repo_hash>|<agent_id>|<role>|<run_id>|<cycle>|<step>|L000001] {json}
 *
 * The line counter is monotonic per process. Anything that does not fit this
 * shape is not an event and must not be parsed as one.
 */

export const STEPS = [
  'BOOTSTRAP',
  'SNAPSHOT',
  'EXHUME',
  'CARTO',
  'OPERATE',
  'SURGERY',
  'SYNTH',
  'APPLY',
  'PROOF',
  'CHECKPOINT',
  'RECURSE',
] as const;

export type Step = (typeof STEPS)[number];

export type Role =
  | 'EXHUMER'
  | 'CARTOGRAPHER'
  | 'OPERATOR'
  | 'SURGEON'
  | 'SYNTH'
  | 'COORD';

/** The minimum event types the transport understands. */
export type EventType =
  | 'cmd'
  | 'stdout'
  | 'stderr'
  | 'file_read'
  | 'file_write'
  | 'decision'
  | 'proof'
  | 'checkpoint'
  | 'OUTPUT_CHUNKS'
  | 'EXHUME'
  | 'warning';

export interface Event {
  type: EventType;
  [key: string]: unknown;
}

export interface FrameContext {
  repoHash: string;
  agentId: string;
  role: Role;
  runId: string;
  cycle: number;
}

export const FRAME_PATTERN =
  /^\[CHR\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(\d+)\|([A-Z]+)\|L(\d{6})\] (\{.*\})$/;

/** Monotonic line counter. One instance per emitting process. */
export class LineCounter {
  private n = 0;

  next(): number {
    this.n += 1;
    return this.n;
  }

  get value(): number {
    return this.n;
  }
}

export function formatLine(n: number): string {
  return 'L' + String(n).padStart(6, '0');
}

/**
 * Compose one framed line. `step` is explicit: it is a transport header
 * field, not part of the JSON payload, so it must never be inferred.
 */
export function frame(ctx: FrameContext, line: number, step: Step, event: Event): string {
  const payload = JSON.stringify(event);
  return `[CHR|${ctx.repoHash}|${ctx.agentId}|${ctx.role}|${ctx.runId}|${ctx.cycle}|${step}|${formatLine(line)}] ${payload}`;
}


/** Parse a framed line. Returns null when the line is not a valid event. */
export function parseFrame(line: string): { frame: FrameContext; line: number; event: Event } | null {
  const m = FRAME_PATTERN.exec(line.trimEnd());
  if (!m) return null;
  try {
    const event = JSON.parse(m[8]) as Event;
    return {
      frame: {
        repoHash: m[1],
        agentId: m[2],
        role: m[3] as Role,
        runId: m[4],
        cycle: Number(m[5]),
      },
      line: Number(m[7]),
      event,
    };
  } catch {
    return null;
  }
}

/** Emits framed events on a single stream. Never truncates, never swallows. */
export class EventBus {
  private counter = new LineCounter();

  /**
   * `cycleProvider` is evaluated at emit time, not construction time, so a
   * long-lived bus frames later cycles with the current cycle number.
   */
  constructor(
    private readonly ctx: FrameContext,
    private readonly write: (s: string) => void = (s) => process.stdout.write(s + '\n'),
    private readonly cycleProvider: () => number = () => ctx.cycle,
  ) {}

  emit(step: Step, event: Event): string {
    const line = this.counter.next();
    const framed = frame({ ...this.ctx, cycle: this.cycleProvider() }, line, step, event);
    this.write(framed);
    return framed;
  }

  get line(): number {
    return this.counter.value;
  }
}
