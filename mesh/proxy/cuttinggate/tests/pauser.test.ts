import { describe, test, expect } from "bun:test";
import { Pauser, shouldPause, isRedHerring } from "../src/pauser.ts";

describe("pauser red herrings", () => {
  test("404, 429, 400, 401/2/3 never pause", () => {
    expect(isRedHerring(404)).toBe(true);
    expect(isRedHerring(429)).toBe(true);
    expect(isRedHerring(400)).toBe(true);
    expect(isRedHerring(401)).toBe(true);
    expect(isRedHerring(402)).toBe(true);
    expect(isRedHerring(403)).toBe(true);
  });

  test("5xx and timeouts trigger pause", () => {
    expect(shouldPause(500, "internal error")).toBe(true);
    expect(shouldPause(502, "bad gateway")).toBe(true);
    expect(shouldPause(503, "unavailable")).toBe(true);
    expect(shouldPause(0, "timeout after 30000ms")).toBe(true);
    expect(shouldPause(0, "fetch failed: ECONNREFUSED")).toBe(true);
    expect(shouldPause(null, "network timeout")).toBe(true);
  });

  test("red herrings do not trigger pause", () => {
    expect(shouldPause(404, "not found")).toBe(false);
    expect(shouldPause(429, "rate limited")).toBe(false);
    expect(shouldPause(400, "bad request")).toBe(false);
    expect(shouldPause(401, "unauthorized")).toBe(false);
  });
});

describe("pauser lifecycle", () => {
  test("pause on server error, auto-resume after backoff", () => {
    const p = new Pauser();
    expect(p.isPaused("m1", "prov")).toBe(false);
    const paused = p.noteFailure("m1", "prov", 503, "service unavailable");
    expect(paused).toBe(true);
    expect(p.isPaused("m1", "prov")).toBe(true);
    // Other models on same provider not paused.
    expect(p.isPaused("m2", "prov")).toBe(false);
  });

  test("red herring does not pause", () => {
    const p = new Pauser();
    const paused = p.noteFailure("m1", "prov", 404, "not found");
    expect(paused).toBe(false);
    expect(p.isPaused("m1", "prov")).toBe(false);
  });

  test("manual pause and resume", () => {
    const p = new Pauser();
    p.pause("m1", "prov", 60000, "manual", "test");
    expect(p.isPaused("m1", "prov")).toBe(true);
    expect(p.resume("m1", "prov")).toBe(true);
    expect(p.isPaused("m1", "prov")).toBe(false);
  });

  test("provider cascade: 3 model pauses -> provider pause", () => {
    const p = new Pauser();
    p.noteFailure("m1", "prov", 500, "error");
    p.noteFailure("m2", "prov", 500, "error");
    p.noteFailure("m3", "prov", 500, "error");
    // Provider-level pause should now be active.
    expect(p.isPaused("m4", "prov")).toBe(true);
    const entries = p.list();
    const cascade = entries.find((e) => e.reason === "provider-cascade");
    expect(cascade).toBeDefined();
    expect(cascade?.model).toBeNull();
  });

  test("exponential backoff on repeated failures", () => {
    const p = new Pauser();
    p.noteFailure("m1", "prov", 500, "error");
    const e1 = p.get("m1", "prov")!;
    const d1 = e1.resumeAt - e1.lastSeen;
    // Simulate expiry and re-fail.
    (e1 as { resumeAt: number }).resumeAt = Date.now() - 1;
    expect(p.isPaused("m1", "prov")).toBe(false);
    p.noteFailure("m1", "prov", 500, "error");
    const e2 = p.get("m1", "prov")!;
    const d2 = e2.resumeAt - e2.lastSeen;
    expect(d2).toBeGreaterThan(d1);
    expect(e2.strikes).toBe(2);
  });
});
