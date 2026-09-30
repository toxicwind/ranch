// windmill — GPU / PCIe telemetry for the ranch.
// The thing on the ranch that never stops spinning and tells you which way the wind blows.
// Rebuilt 2026-09-30 (was: pcie-moe-telemetry, whose server file went missing from disk).
// Bun, zero dependencies. Polls nvidia-smi, serves JSON.
//
// Endpoints:
//   GET /api/status   -> 200 + summary (pitchfork health/ready contract — keep stable)
//   GET /api/gpu      -> full per-GPU vitals
//   GET /api/pcie     -> PCIe link + throughput detail
//   GET /api/history  -> ring buffer of recent samples (5s cadence)

const PORT = Number(process.env.WINDMILL_PORT ?? 25219);
const POLL_MS = 5_000;
const HISTORY_MAX = 360; // 30 min at 5s cadence

type GpuVitals = {
  index: number;
  name: string;
  temp_c: number | null;
  power_w: number | null;
  util_gpu_pct: number | null;
  util_mem_pct: number | null;
  mem_used_mib: number | null;
  mem_total_mib: number | null;
  fan_pct: number | null;
  clocks_mhz: { graphics: number | null; mem: number | null };
  pcie: {
    gen_current: number | null;
    gen_max: number | null;
    width_current: number | null;
    width_max: number | null;
    tx_kbps: number | null;
    rx_kbps: number | null;
  };
};

type Sample = { ts: number; gpus: GpuVitals[]; degraded: boolean };

let latest: Sample = { ts: Date.now(), gpus: [], degraded: true };
const history: Sample[] = [];
const bootedAt = Date.now();

const num = (s: string): number | null => {
  const t = s.trim();
  if (!t || t === "[N/A]" || t.toLowerCase() === "n/a") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

async function sh(cmd: string, args: string[]): Promise<string> {
  const p = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  if (p.exitCode !== 0) throw new Error(`${cmd} exited ${p.exitCode}`);
  return out;
}

async function poll(): Promise<void> {
  try {
    const [vitalsCsv, qOut] = await Promise.all([
      sh("nvidia-smi", [
        "--query-gpu=index,name,temperature.gpu,power.draw,utilization.gpu,utilization.memory,memory.used,memory.total,fan.speed,clocks.gr,clocks.mem,pcie.link.gen.current,pcie.link.gen.max,pcie.link.width.current,pcie.link.width.max",
        "--format=csv,noheader,nounits",
      ]),
      sh("nvidia-smi", ["-q"]),
    ]);

    // Throughput lines look like: "        Tx Throughput  : 57031 KB/s"
    const txRx: { tx: (number | null)[]; rx: (number | null)[] } = { tx: [], rx: [] };
    for (const line of qOut.split("\n")) {
      const m = line.match(/(Tx|Rx) Throughput\s*:\s*([\d.]+)\s*KB\/s/);
      if (m) (m[1] === "Tx" ? txRx.tx : txRx.rx).push(Number(m[2]));
    }

    const gpus: GpuVitals[] = vitalsCsv
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line, i) => {
        const f = line.split(",").map((s) => s.trim());
        return {
          index: num(f[0]) ?? i,
          name: f[1] ?? "unknown",
          temp_c: num(f[2]),
          power_w: num(f[3]),
          util_gpu_pct: num(f[4]),
          util_mem_pct: num(f[5]),
          mem_used_mib: num(f[6]),
          mem_total_mib: num(f[7]),
          fan_pct: num(f[8]),
          clocks_mhz: { graphics: num(f[9]), mem: num(f[10]) },
          pcie: {
            gen_current: num(f[11]),
            gen_max: num(f[12]),
            width_current: num(f[13]),
            width_max: num(f[14]),
            tx_kbps: txRx.tx[i] ?? null,
            rx_kbps: txRx.rx[i] ?? null,
          },
        };
      });

    latest = { ts: Date.now(), gpus, degraded: false };
    history.push(latest);
    if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
  } catch (err) {
    latest = { ...latest, ts: Date.now(), degraded: true };
    console.error(`[windmill] poll failed: ${err}`);
  }
}

function summary() {
  const g = latest.gpus[0];
  return {
    ok: !latest.degraded && latest.gpus.length > 0,
    name: "windmill",
    ts: latest.ts,
    uptime_s: Math.floor((Date.now() - bootedAt) / 1000),
    degraded: latest.degraded,
    gpu_count: latest.gpus.length,
    gpu: g
      ? {
          name: g.name,
          temp_c: g.temp_c,
          power_w: g.power_w,
          util_gpu_pct: g.util_gpu_pct,
          mem_used_mib: g.mem_used_mib,
          mem_total_mib: g.mem_total_mib,
        }
      : null,
    pcie: g
      ? {
          gen: `${g.pcie.gen_current ?? "?"}/${g.pcie.gen_max ?? "?"}`,
          width: `x${g.pcie.width_current ?? "?"}/x${g.pcie.width_max ?? "?"}`,
          tx_kbps: g.pcie.tx_kbps,
          rx_kbps: g.pcie.rx_kbps,
        }
      : null,
  };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const json = (data: unknown, status = 200) =>
      Response.json(data, { status, headers: { "cache-control": "no-store" } });
    switch (url.pathname) {
      case "/api/status":
        return json(summary());
      case "/api/gpu":
        return json({ ts: latest.ts, degraded: latest.degraded, gpus: latest.gpus });
      case "/api/pcie":
        return json({
          ts: latest.ts,
          degraded: latest.degraded,
          pcie: latest.gpus.map((g) => ({ index: g.index, name: g.name, ...g.pcie })),
        });
      case "/api/history":
        return json({ ts: Date.now(), cadence_ms: POLL_MS, samples: history });
      default:
        return json({ error: "not found", routes: ["/api/status", "/api/gpu", "/api/pcie", "/api/history"] }, 404);
    }
  },
});

await poll();
setInterval(poll, POLL_MS);
console.log(`\u{1F32C}\uFE0F windmill spinning on http://localhost:${server.port} (was pcie-moe-telemetry)`);
