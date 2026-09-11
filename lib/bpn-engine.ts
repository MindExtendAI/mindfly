import type { BpnData } from './bpn-circuit';
import { loadWasmBpn, type BpnEngine } from './wasm-bpn';
export type EngineStatus =
  | 'Loading Rust/WASM'
  | 'Rust/WASM'
  | 'WASM unavailable';

/** The neural simulation is WASM-only. Loading/runtime failures never select JS. */
export async function createBpnEngine(
  data: BpnData,
  signal: AbortSignal,
  report: (s: EngineStatus) => void,
  load = loadWasmBpn,
): Promise<BpnEngine> {
  report('Loading Rust/WASM');
  try {
    const candidate = await load(data, signal);
    if (signal.aborted) {
      candidate.dispose?.();
      throw new DOMException('Aborted', 'AbortError');
    }
    report('Rust/WASM');
    return candidate;
  } catch (error) {
    if (!signal.aborted) report('WASM unavailable');
    throw error;
  }
}
