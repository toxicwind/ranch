// 🔥 Campfire — decision: the structured intervention judgment.
// Borrowed from berkmancenter/llm_engine's proactiveGroupAgent:
//   {reasoning, shouldIntervene, goalId, sharedChatMessage, confidenceScore, detectedPattern}
//
// "Should I speak?" is an explicit, auditable decision — never vibes.
// Every blocked or allowed post produces a record. The record is the
// accountability: why this post, why now, how sure.

export type GoalId =
  | "welcome-newcomer"
  | "nudge-question"
  | "celebrate-win"
  | "connect-agents"
  | "checkin-silent"
  | "reflect-backoff";

export interface Decision {
  /** Short reasoning: what triggered this, in plain words. */
  reasoning: string;
  /** The gate's verdict. */
  shouldSpeak: boolean;
  /** Which goal this serves. */
  goal: GoalId;
  /** The message that would be posted (if shouldSpeak). */
  message: string;
  /** 0-1. Below the goal's minConfidence → stay quiet. */
  confidence: number;
  /** What pattern was detected (join/question/milestone/silence/...). */
  detectedPattern: string;
  /** Why blocked, if shouldSpeak is false. */
  blockReason?: string;
  /** When the decision was made. */
  at: number;
}

/** Per-goal minimum confidence thresholds. */
export const MIN_CONFIDENCE: Record<GoalId, number> = {
  "welcome-newcomer": 0.6,
  "nudge-question": 0.7,
  "celebrate-win": 0.65,
  "connect-agents": 0.75,
  "checkin-silent": 0.6,
  "reflect-backoff": 1.0, // backoff is never uncertain
};

/**
 * Make the decision. Runs AFTER the room gate (flow/quiet-hours/rate)
 * and the goal-specific logic. This is the final auditable record.
 */
export function decide(
  goal: GoalId,
  message: string,
  confidence: number,
  detectedPattern: string,
  reasoning: string,
  roomBlocked?: string
): Decision {
  const at = Date.now();
  const minConf = MIN_CONFIDENCE[goal];

  if (roomBlocked) {
    return {
      reasoning,
      shouldSpeak: false,
      goal,
      message,
      confidence,
      detectedPattern,
      blockReason: roomBlocked,
      at,
    };
  }

  if (confidence < minConf) {
    return {
      reasoning,
      shouldSpeak: false,
      goal,
      message,
      confidence,
      detectedPattern,
      blockReason: `confidence ${confidence.toFixed(2)} < ${minConf} for ${goal}`,
      at,
    };
  }

  return { reasoning, shouldSpeak: true, goal, message, confidence, detectedPattern, at };
}
