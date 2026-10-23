// cuda_probe.ts — precise GPU timing via CUDA driver API events (bun:ffi).
// The "precise" half of windmill: nvidia-smi polling tells you the hardware's
// state, CUDA events tell you its actual responsiveness (kernel round-trip ms).
// Lazy, best-effort: if libcuda won't load, everything reports available:false
// and the daemon stays green. Never throws out of probe().

import { dlopen, FFIType, ptr } from "bun:ffi";

const i32 = FFIType.i32;
const u32 = FFIType.u32;
const u64 = FFIType.u64;
const u8 = FFIType.u8;
const f32 = FFIType.f32;
const pointer = FFIType.pointer;

type Lib = {
  symbols: {
    cuInit(flags: number): number;
    cuDeviceGet(device: unknown, ordinal: number): number;
    cuCtxCreate(ctx: unknown, flags: number, device: number): number;
    cuMemAlloc(dptr: unknown, bytesize: number | bigint): number;
    cuMemsetD8(dstDevice: number | bigint, uc: number, n: number | bigint): number;
    cuEventCreate(event: unknown, flags: number): number;
    cuEventRecord(event: unknown, stream: unknown): number;
    cuEventSynchronize(event: unknown): number;
    cuEventElapsedTime(ms: unknown, start: unknown, end: unknown): number;
    cuEventDestroy(event: unknown): number;
    cuMemFree(dptr: number | bigint): number;
    cuCtxDestroy(ctx: unknown): number;
  };
};

let lib: Lib | null = null;
let available = false;
let initError: string | null = null;
let ctx: unknown = null;

const CU_EVENT_DEFAULT = 0;
const PROBE_BYTES = 4 * 1024 * 1024; // 4MB memset — big enough to time honestly

function ensure(): boolean {
  if (lib) return available;
  try {
    lib = dlopen("libcuda.so.1", {
      cuInit: { args: [i32], returns: i32 },
      cuDeviceGet: { args: [pointer, i32], returns: i32 },
      cuCtxCreate: { args: [pointer, u32, i32], returns: i32 },
      cuMemAlloc: { args: [pointer, u64], returns: i32 },
      cuMemsetD8: { args: [u64, u8, u64], returns: i32 },
      cuEventCreate: { args: [pointer, u32], returns: i32 },
      cuEventRecord: { args: [pointer, pointer], returns: i32 },
      cuEventSynchronize: { args: [pointer], returns: i32 },
      cuEventElapsedTime: { args: [pointer, pointer, pointer], returns: i32 },
      cuEventDestroy: { args: [pointer], returns: i32 },
      cuMemFree: { args: [u64], returns: i32 },
      cuCtxDestroy: { args: [pointer], returns: i32 },
    }) as unknown as Lib;

    const ok = (rc: number, what: string) => {
      if (rc !== 0) throw new Error(`${what} -> CUDA error ${rc}`);
    };
    ok(lib.symbols.cuInit(0), "cuInit");
    const devOut = new Int32Array(1);
    ok(lib.symbols.cuDeviceGet(ptr(devOut), 0), "cuDeviceGet");
    const ctxOut = new BigUint64Array(1);
    ok(lib.symbols.cuCtxCreate(ptr(ctxOut), 0, devOut[0]!), "cuCtxCreate");
    ctx = ctxOut[0];
    available = true;
  } catch (e) {
    initError = e instanceof Error ? e.message : String(e);
    available = false;
    lib = null;
  }
  return available;
}

export type CudaProbeResult = {
  available: boolean;
  elapsed_ms?: number;
  bytes?: number;
  error?: string;
};

export function cudaAvailable(): boolean {
  return ensure();
}

export function cudaInitError(): string | null {
  ensure();
  return initError;
}

/** Time a 4MB device memset with CUDA events. Never throws. */
export function probe(): CudaProbeResult {
  if (!ensure() || !lib) return { available: false, error: initError ?? "libcuda unavailable" };
  try {
    const s = lib.symbols;
    const ok = (rc: number, what: string) => {
      if (rc !== 0) throw new Error(`${what} -> CUDA error ${rc}`);
    };
    const dptrOut = new BigUint64Array(1);
    ok(s.cuMemAlloc(ptr(dptrOut), PROBE_BYTES), "cuMemAlloc");
    const dptr = dptrOut[0]!;
    try {
      const evOut = new BigUint64Array(2);
      ok(s.cuEventCreate(ptr(evOut.subarray(0, 1)), CU_EVENT_DEFAULT), "cuEventCreate(start)");
      ok(s.cuEventCreate(ptr(evOut.subarray(1, 2)), CU_EVENT_DEFAULT), "cuEventCreate(stop)");
      const start = evOut[0]! as unknown;
      const stop = evOut[1]! as unknown;
      try {
        ok(s.cuEventRecord(start as never, null), "cuEventRecord(start)");
        ok(s.cuMemsetD8(dptr, 0, PROBE_BYTES), "cuMemsetD8");
        ok(s.cuEventRecord(stop as never, null), "cuEventRecord(stop)");
        ok(s.cuEventSynchronize(stop as never), "cuEventSynchronize");
        const msOut = new Float32Array(1);
        ok(
          s.cuEventElapsedTime(ptr(msOut), start as never, stop as never),
          "cuEventElapsedTime",
        );
        return { available: true, elapsed_ms: msOut[0]!, bytes: PROBE_BYTES };
      } finally {
        s.cuEventDestroy(start as never);
        s.cuEventDestroy(stop as never);
      }
    } finally {
      s.cuMemFree(dptr);
    }
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Standalone: `bun cuda_probe.ts` prints one probe as JSON.
if (import.meta.main) {
  console.log(JSON.stringify(probe()));
}
