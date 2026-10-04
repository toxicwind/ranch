// Model Disabler with Anomaly Detection and Recheck
// States: active -> disabled (backoff recheck) -> active | anomalous (flaky)
export type ModelState = "active" | "disabled" | "anomalous";
interface ModelRecord {
  state: ModelState;
  consecFails: number;
  consecSuccess: number;
  flips: number;          // success->fail or fail->success transitions
  lastCheck: number;      // epoch seconds
  nextRecheck: number;    // epoch seconds, for disabled
  backoffSec: number;     // current backoff
  lastError: string;
}
const MAX_BACKOFF = 86400; // 24h
const FAIL_THRESHOLD = 3;   // consec fails to disable
const FLIP_THRESHOLD = 4;   // flips to mark anomalous
export class ModelDisabler {
  private models = new Map<string, ModelRecord>();
  private get(key: string): ModelRecord {
    let r = this.models.get(key);
    if (!r) {
      r = { state: "active", consecFails: 0, consecSuccess: 0, flips: 0,
            lastCheck: 0, nextRecheck: 0, backoffSec: 60, lastError: "" };
      this.models.set(key, r);
    }
    return r;
  }
  /** Record a probe result. Returns the new state. */
  record(key: string, ok: boolean, err = ""): ModelState {
    const r = this.get(key);
    const now = Date.now() / 1000;
    const wasOk = r.consecSuccess > 0 && r.consecFails === 0;
    if (ok) {
      if (r.consecFails > 0) r.flips++;  // fail -> success
      r.consecSuccess++; r.consecFails = 0; r.lastError = "";
      if (r.state === "disabled" && r.consecSuccess >= 2) {
        r.state = "active"; r.backoffSec = 60; r.flips = 0;
      }
    } else {
      if (wasOk || r.consecSuccess > 0) r.flips++;  // success -> fail
      r.consecFails++; r.consecSuccess = 0; r.lastError = err;
      if (r.flips >= FLIP_THRESHOLD && r.state !== "anomalous") {
        r.state = "anomalous";
      } else if (r.consecFails >= FAIL_THRESHOLD && r.state === "active") {
        r.state = "disabled";
        r.nextRecheck = now + r.backoffSec;
        r.backoffSec = Math.min(r.backoffSec * 2, MAX_BACKOFF);
      }
    }
    r.lastCheck = now;
    return r.state;
  }
  isDisabled(key: string): boolean {
    const r = this.models.get(key);
    return !!r && r.state === "disabled";
  }
  isAnomalous(key: string): boolean {
    const r = this.models.get(key);
    return !!r && r.state === "anomalous";
  }
  /** Models due for recheck. */
  dueForRecheck(now = Date.now() / 1000): string[] {
    const out: string[] = [];
    this.models.forEach((r, k) => {
      if (r.state === "disabled" && r.nextRecheck <= now) out.push(k);
    });
    return out;
  }
  stats() {
    let active = 0, disabled = 0, anomalous = 0;
    for (const r of Array.from(this.models.values())) {
      if (r.state === "active") active++;
      else if (r.state === "disabled") disabled++;
      else anomalous++;
    }
    return { active, disabled, anomalous, total: this.models.size };
  }
  snapshot(): Record<string, any> {
    const o: Record<string, any> = {};
    this.models.forEach((r, k) => { o[k] = { ...r }; });
    return o;
  }
}
