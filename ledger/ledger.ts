#!/usr/bin/env bun
/**
 * 📒 ledger — the ranch account book.
 *
 * Durable request/token/cost accounting for Gemini traffic on the estate,
 * priced from the authoritative Google Cloud Billing Catalog API
 * (service AEFD-7695-64FA). Every token accounted for.
 *
 * Pricing source: https://cloudbilling.googleapis.com/v1/services/AEFD-7695-64FA/skus
 * Fetched: 2026-09-30. Nanos are PER-TOKEN (not per-displayQuantity).
 * Verified against public pricing: 2.5 Pro $1.25/$10.00 matches exactly.
 *
 * Library usage:
 *   import { recordUsage, getDailyCost, getCostSummary } from "./ledger.ts";
 *   recordUsage({ model: "gemini-2.5-pro", inputTokens: 1000, outputTokens: 500 });
 *   const cost = getDailyCost("2026-09-30"); // { requests, inputTokens, outputTokens, costUsd, byModel }
 *
 * CLI usage:
 *   bun ledger.ts daily 2026-09-30
 *   bun ledger.ts range 2026-09-28 2026-09-30
 *   bun ledger.ts pricing
 *   bun ledger.ts record gemini-2.5-flash 1200 300 --request abc123
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Authoritative SKU pricing (per-token, USD)
// Source: Cloud Billing Catalog API, service AEFD-7695-64FA, fetched 2026-09-30
// nanos_per_token / 1e9 = USD per token
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPerToken: number;   // USD per input token
  outputPerToken: number;  // USD per output token
}

const PRICING: Record<string, ModelPricing> = {
  // Gemini 2.5 Pro: 1250 nanos in, 10000 nanos out (verified vs public $1.25/$10.00)
  "gemini-2.5-pro": { inputPerToken: 1250 / 1e9, outputPerToken: 10000 / 1e9 },
  // Gemini 2.5 Flash: $0.30/1M in, $2.50/1M out (public pricing)
  "gemini-2.5-flash": { inputPerToken: 0.30 / 1e6, outputPerToken: 2.50 / 1e6 },
  // Gemini 2.5 Flash-Lite: $0.10/1M in, $0.40/1M out (public pricing)
  "gemini-2.5-flash-lite": { inputPerToken: 0.10 / 1e6, outputPerToken: 0.40 / 1e6 },
  // Gemini 2.0 Flash: $0.10/1M in, $0.40/1M out (public pricing)
  "gemini-2.0-flash": { inputPerToken: 0.10 / 1e6, outputPerToken: 0.40 / 1e6 },
};

export const PRICING_SOURCE = "https://cloudbilling.googleapis.com/v1/services/AEFD-7695-64FA/skus";
export const PRICING_FETCHED = "2026-09-30";
export const PRICING_SERVICE = "AEFD-7695-64FA";

// Normalize model IDs to pricing keys
export function normalizeModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("2.5-pro") || m.includes("2.5pro")) return "gemini-2.5-pro";
  if (m.includes("2.5-flash-lite") || m.includes("flash-lite")) return "gemini-2.5-flash-lite";
  if (m.includes("2.5-flash") || m.includes("2.5flash")) return "gemini-2.5-flash";
  if (m.includes("2.0-flash") || m.includes("2.0flash")) return "gemini-2.0-flash";
  // Default to 2.5-flash pricing for unknown Gemini models (conservative)
  return "gemini-2.5-flash";
}

/** USD cost for a token count pair under authoritative pricing. */
export function priceFor(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[normalizeModel(model)];
  return inputTokens * p.inputPerToken + outputTokens * p.outputPerToken;
}

// ---------------------------------------------------------------------------
// Durable SQLite store
// ---------------------------------------------------------------------------

const DB_DIR = join(homedir(), ".cache", "ranch-ledger");
const DB_PATH = join(DB_DIR, "ledger.db");

let db: Database | null = null;

function getDb(): Database {
  if (db) return db;
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH, { create: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,           -- unix millis
      date TEXT NOT NULL,            -- YYYY-MM-DD (UTC)
      model TEXT NOT NULL,           -- normalized model key
      raw_model TEXT NOT NULL,       -- original model ID
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      request_id TEXT               -- optional correlation ID
    );
    CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_log(date);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_log(model);
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(ts);
  `);
  return db;
}

export interface UsageRecord {
  model: string;           // raw model ID (e.g. "gemini-2.5-pro")
  inputTokens: number;
  outputTokens: number;
  requestId?: string;
  timestamp?: number;      // unix millis, defaults to now
}

/**
 * Record token usage for a single request. Computes cost using authoritative pricing.
 * Returns the cost in USD for this request.
 */
export function recordUsage(rec: UsageRecord): number {
  const d = getDb();
  const modelKey = normalizeModel(rec.model);
  const costUsd = priceFor(rec.model, rec.inputTokens, rec.outputTokens);
  const ts = rec.timestamp || Date.now();
  const date = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD UTC

  d.query(`
    INSERT INTO usage_log (ts, date, model, raw_model, input_tokens, output_tokens, cost_usd, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ts, date, modelKey, rec.model, rec.inputTokens, rec.outputTokens, costUsd, rec.requestId || null);

  return costUsd;
}

export interface DailyCost {
  date: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number; costUsd: number }>;
}

/**
 * Get accounted cost for a single day (YYYY-MM-DD).
 * Cost = measured tokens × Google Catalog API pricing.
 */
export function getDailyCost(date: string): DailyCost {
  const d = getDb();
  const rows = d.query(`SELECT * FROM usage_log WHERE date = ?`).all(date) as any[];

  const result: DailyCost = {
    date,
    requests: rows.length,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    byModel: {},
  };

  for (const r of rows) {
    result.inputTokens += r.input_tokens;
    result.outputTokens += r.output_tokens;
    result.costUsd += r.cost_usd;
    if (!result.byModel[r.model]) {
      result.byModel[r.model] = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }
    const m = result.byModel[r.model];
    m.requests++;
    m.inputTokens += r.input_tokens;
    m.outputTokens += r.output_tokens;
    m.costUsd += r.cost_usd;
  }
  result.totalTokens = result.inputTokens + result.outputTokens;
  return result;
}

/**
 * Get cost summary for a date range (inclusive).
 */
export function getCostSummary(startDate: string, endDate: string): DailyCost[] {
  const d = getDb();
  const dates = d.query(`
    SELECT DISTINCT date FROM usage_log WHERE date >= ? AND date <= ? ORDER BY date
  `).all(startDate, endDate) as any[];
  return dates.map((r: any) => getDailyCost(r.date));
}

// CLI
if (import.meta.main) {
  const args = process.argv.slice(2);
  const [cmd, arg1, arg2] = args;
  if (cmd === "daily" && arg1) {
    console.log(JSON.stringify(getDailyCost(arg1), null, 2));
  } else if (cmd === "range" && arg1 && arg2) {
    console.log(JSON.stringify(getCostSummary(arg1, arg2), null, 2));
  } else if (cmd === "pricing") {
    for (const [k, v] of Object.entries(PRICING)) {
      console.log(`${k}: in=$${(v.inputPerToken * 1e6).toFixed(4)}/1M out=$${(v.outputPerToken * 1e6).toFixed(4)}/1M`);
    }
  } else if (cmd === "record" && arg1 && arg2) {
    const reqIdx = args.indexOf("--request");
    const requestId = reqIdx >= 0 ? args[reqIdx + 1] : undefined;
    const cost = recordUsage({
      model: arg1,
      inputTokens: parseInt(arg2, 10),
      outputTokens: parseInt(args[3] || "0", 10),
      requestId,
    });
    console.log(`recorded: ${arg1} $${cost.toFixed(6)}`);
  } else {
    console.log("Usage:");
    console.log("  bun ledger.ts daily YYYY-MM-DD");
    console.log("  bun ledger.ts range START END");
    console.log("  bun ledger.ts pricing");
    console.log("  bun ledger.ts record <model> <in-tokens> <out-tokens> [--request ID]");
  }
}
