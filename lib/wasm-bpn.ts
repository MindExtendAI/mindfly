import { assetUrl } from './asset-url';
import type { BpnData, BpnOutput } from "./bpn-circuit";
export type BpnEngine = {
  advance(on: boolean): BpnOutput;
  reset(): void;
  dispose?(): void;
};
type Exports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  engine_new(n: number, d: number, s: number, c: number, f: number): number;
  engine_free(p: number): void;
  engine_reset(p: number): void;
  engine_advance(p: number, on: number): void;
  engine_target(p: number, i: number): void;
  engine_edge(p: number, a: number, b: number, w: number): void;
  engine_term(p: number, w: number, n: number): void;
  engine_term_index(p: number, i: number): void;
  engine_counts(p: number): number;
  engine_activity(p: number): number;
  engine_events(p: number): number;
  engine_events_len(p: number): number;
  engine_forward(p: number): number;
  engine_pulses(p: number): number;
};
export class WasmBpnCircuit implements BpnEngine {
  private pointer: number;
  private x: Exports;
  readonly activity: Float32Array;
  constructor(
    readonly data: BpnData,
    instance: WebAssembly.Instance,
  ) {
    const n = data.nodes.length;
    const validIndex = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
    if (
      n < 1 ||
      n > 100000 ||
      !data.inputs.every(validIndex) ||
      new Set(data.inputs).size !== data.inputs.length ||
      !data.edges.every(
        ([a, b, count, sign]) =>
          validIndex(a) &&
          validIndex(b) &&
          Number.isFinite(count) &&
          count >= 0 &&
          Number.isFinite(sign),
      ) ||
      !data.forwardTerms.every(
        (t) =>
          Number.isFinite(t.weight) &&
          Number.isFinite(t.populationSize) &&
          t.populationSize >= 0 &&
          t.indices.every(validIndex),
      )
    )
      throw Error("Invalid WASM circuit graph");
    this.x = instance.exports as Exports;
    const required = [
      "engine_new",
      "engine_free",
      "engine_reset",
      "engine_advance",
      "engine_target",
      "engine_edge",
      "engine_term",
      "engine_term_index",
      "engine_counts",
      "engine_activity",
      "engine_events",
      "engine_events_len",
      "engine_forward",
      "engine_pulses",
    ];
    if (
      !(this.x.memory instanceof WebAssembly.Memory) ||
      required.some((k) => typeof this.x[k] !== "function")
    )
      throw Error("Invalid WASM engine exports");
    this.activity = new Float32Array(n);
    const f = Math.fround;
    this.pointer = this.x.engine_new(
      n,
      f(Math.exp(-0.5 / 20)),
      f(Math.exp(-0.5 / 5)),
      f((5 / 15) * (Math.exp(-0.5 / 20) - Math.exp(-0.5 / 5))),
      1 - Math.exp(-50 / 150),
    );
    if (!this.pointer) throw Error("WASM allocation failed");
    try {
      for (const i of data.inputs) this.x.engine_target(this.pointer, i);
      for (const [a, b, count, sign] of data.edges)
        this.x.engine_edge(
          this.pointer,
          a,
          b,
          f(f(sign * 0.275 * 0.65) * count),
        );
      for (const t of data.forwardTerms) {
        this.x.engine_term(this.pointer, t.weight, t.populationSize);
        for (const i of t.indices) this.x.engine_term_index(this.pointer, i);
      }
    } catch (e) {
      this.dispose();
      throw e;
    }
  }
  reset() {
    this.check();
    this.x.engine_reset(this.pointer);
    this.activity.fill(0);
  }
  dispose() {
    if (this.pointer) {
      this.x.engine_free(this.pointer);
      this.pointer = 0;
    }
  }
  private check() {
    if (!this.pointer) throw Error("WASM engine disposed");
  }
  advance(on: boolean): BpnOutput {
    this.check();
    const x = this.x,
      p = this.pointer,
      n = this.data.nodes.length;
    x.engine_advance(p, on ? 1 : 0);
    // Recreate views after every call: Rust may grow WebAssembly memory.
    const counts = new Uint32Array(
      x.memory.buffer,
      x.engine_counts(p),
      n,
    ).slice();
    this.activity.set(
      new Float32Array(x.memory.buffer, x.engine_activity(p), n),
    );
    const packed = new Uint32Array(
      x.memory.buffer,
      x.engine_events(p),
      x.engine_events_len(p),
    );
    const spikeEvents = [];
    for (let i = 0; i < packed.length; i += 2)
      spikeEvents.push({ neuron: packed[i], offsetMs: packed[i + 1] * 0.5 });
    return {
      forward: x.engine_forward(p),
      inputHz: on ? 10 : 0,
      targetSpikes: this.data.inputs.reduce((s, i) => s + counts[i], 0),
      totalSpikes: counts.reduce((s, v) => s + v, 0),
      active: this.activity,
      pulses: x.engine_pulses(p),
      spikeCounts: counts,
      spikeEvents,
    };
  }
}
export async function loadWasmBpn(data: BpnData, signal?: AbortSignal) {
  const response = await fetch(assetUrl("/wasm/neural-engine.wasm"), {
    signal: AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(8000),
    ]),
  });
  if (!response.ok) throw Error(`WASM download failed (${response.status})`);
  // arrayBuffer works with both WASM and generic binary server MIME types.
  const compiledModule = await WebAssembly.compile(await response.arrayBuffer());
  const instance = await WebAssembly.instantiate(compiledModule, {});
  return new WasmBpnCircuit(data, instance);
}
