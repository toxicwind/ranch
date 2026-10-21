import { TaskIO, Either, Option } from "./monad";
import { spawn } from "node:child_process";

export interface FfsConfig {
  root?: string;
  bin?: string;
  format?: "json" | "text";
}

export interface FfsHit {
  path: string;
  line: number;
  text: string;
  match_ranges?: [number, number][];
}

export interface FfsGrepResponse {
  needle: string;
  hits: FfsHit[];
  total_files_searched: number;
  total_matches?: number;
  offset: number;
  truncated: boolean;
  has_more?: boolean;
}

export interface FfsSymbolDefinition {
  name: string;
  kind: string;
  path: string;
  start_line: number;
  end_line: number;
  signature?: string;
}

export interface FfsSymbolResponse {
  query: string;
  symbols: FfsSymbolDefinition[];
  total: number;
  offset: number;
  has_more: boolean;
}

export interface FfsCallersResponse {
  name: string;
  callers: Array<{ path: string; line: number; enclosing?: string }>;
  total: number;
  offset: number;
  has_more: boolean;
}

export interface FfsImpactResult {
  path: string;
  score: number;
  reasons: string[];
}

export interface FfsImpactResponse {
  symbol: string;
  results: FfsImpactResult[];
}

/**
 * Functional FFS Client
 * Exposes all operations as purely functional TaskIO monads.
 */
export class FfsMonad {
  readonly root: string;
  readonly bin: string;
  readonly format: "json" | "text";

  constructor(config: FfsConfig = {}) {
    this.root = config.root || process.cwd();
    this.bin = config.bin || process.env.FFS_BIN || "/home/toxic/.local/bin/ffs";
    this.format = config.format || "json";
  }

  static of(config?: FfsConfig): FfsMonad {
    return new FfsMonad(config);
  }

  private exec(subcommand: string, args: (string | number | boolean | undefined)[]): TaskIO<any> {
    return TaskIO.fromPromise(
      () =>
        new Promise((resolve, reject) => {
          const sanitizedArgs = [
            "--root",
            this.root,
            "--format",
            this.format,
            subcommand,
            ...args.filter((a): a is string | number => a !== undefined && a !== false).map(String),
          ];

          const proc = spawn(this.bin, sanitizedArgs);
          let stdout = "";
          let stderr = "";

          proc.stdout.on("data", (d) => (stdout += d.toString()));
          proc.stderr.on("data", (d) => (stderr += d.toString()));

          proc.on("close", (code) => {
            if (code !== 0 && code !== 1 && !stdout.trim()) {
              reject(new Error(`FFS process failed with exit code ${code}: ${stderr}`));
              return;
            }

            if (this.format === "json") {
              try {
                resolve(JSON.parse(stdout));
              } catch (e: any) {
                resolve({ raw: stdout, parseError: e.message });
              }
            } else {
              resolve(stdout);
            }
          });

          proc.on("error", (err) => reject(err));
        })
    );
  }

  // --- Monadic Query API ---

  grep(
    regex: string,
    opts: { group?: boolean; limit?: number; offset?: number } = {}
  ): TaskIO<FfsGrepResponse> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.group) args.push("--group");
    if (opts.limit !== undefined) args.push("--limit", opts.limit);
    if (opts.offset !== undefined) args.push("--offset", opts.offset);
    args.push(regex);
    return this.exec("grep", args);
  }

  find(
    needle: string,
    opts: { scored?: boolean; limit?: number; offset?: number } = {}
  ): TaskIO<any> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.scored) args.push("--scored");
    if (opts.limit !== undefined) args.push("--limit", opts.limit);
    if (opts.offset !== undefined) args.push("--offset", opts.offset);
    args.push(needle);
    return this.exec("find", args);
  }

  symbol(
    name: string,
    opts: { expand?: boolean; limit?: number; offset?: number } = {}
  ): TaskIO<FfsSymbolResponse> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.expand) args.push("--expand");
    if (opts.limit !== undefined) args.push("--limit", opts.limit);
    if (opts.offset !== undefined) args.push("--offset", opts.offset);
    args.push(name);
    return this.exec("symbol", args);
  }

  callers(
    name: string,
    opts: { hops?: number; hubGuard?: number; countBy?: "none" | "caller" | "file"; limit?: number; offset?: number } = {}
  ): TaskIO<FfsCallersResponse> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.hops !== undefined) args.push("--hops", opts.hops);
    if (opts.hubGuard !== undefined) args.push("--hub-guard", opts.hubGuard);
    if (opts.countBy) args.push("--count-by", opts.countBy);
    if (opts.limit !== undefined) args.push("--limit", opts.limit);
    if (opts.offset !== undefined) args.push("--offset", opts.offset);
    args.push(name);
    return this.exec("callers", args);
  }

  callees(
    name: string,
    opts: { depth?: number; hubGuard?: number; limit?: number; offset?: number } = {}
  ): TaskIO<any> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.depth !== undefined) args.push("--depth", opts.depth);
    if (opts.hubGuard !== undefined) args.push("--hub-guard", opts.hubGuard);
    if (opts.limit !== undefined) args.push("--limit", opts.limit);
    if (opts.offset !== undefined) args.push("--offset", opts.offset);
    args.push(name);
    return this.exec("callees", args);
  }

  refs(name: string, opts: { limit?: number; offset?: number } = {}): TaskIO<any> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.limit !== undefined) args.push("--limit", opts.limit);
    if (opts.offset !== undefined) args.push("--offset", opts.offset);
    args.push(name);
    return this.exec("refs", args);
  }

  flow(
    name: string,
    opts: { calleesTop?: number; callersTop?: number; budget?: number; noDidYouMean?: boolean; limit?: number; offset?: number } = {}
  ): TaskIO<any> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.calleesTop !== undefined) args.push("--callees-top", opts.calleesTop);
    if (opts.callersTop !== undefined) args.push("--callers-top", opts.callersTop);
    if (opts.budget !== undefined) args.push("--budget", opts.budget);
    if (opts.noDidYouMean) args.push("--no-did-you-mean");
    if (opts.limit !== undefined) args.push("--limit", opts.limit);
    if (opts.offset !== undefined) args.push("--offset", opts.offset);
    args.push(name);
    return this.exec("flow", args);
  }

  impact(
    symbol: string,
    opts: { hops?: 1 | 2 | 3; hubGuard?: number; limit?: number; offset?: number } = {}
  ): TaskIO<FfsImpactResponse> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.hops !== undefined) args.push("--hops", opts.hops);
    if (opts.hubGuard !== undefined) args.push("--hub-guard", opts.hubGuard);
    if (opts.limit !== undefined) args.push("--limit", opts.limit);
    if (opts.offset !== undefined) args.push("--offset", opts.offset);
    args.push(symbol);
    return this.exec("impact", args);
  }

  read(
    target: string,
    opts: { full?: boolean; section?: boolean; budget?: number; filter?: "none" | "minimal" | "aggressive" } = {}
  ): TaskIO<any> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.full) args.push("--full");
    if (opts.section) args.push("--section");
    if (opts.budget !== undefined) args.push("--budget", opts.budget);
    if (opts.filter) args.push("--filter", opts.filter);
    args.push(target);
    return this.exec("read", args);
  }

  outline(path: string, opts: { style?: "agent" | "tabular" | "markdown" | "structured" } = {}): TaskIO<any> {
    const args: (string | number | boolean | undefined)[] = [];
    if (opts.style) args.push("--style", opts.style);
    args.push(path);
    return this.exec("outline", args);
  }
}
