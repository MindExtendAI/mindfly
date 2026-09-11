import { assetUrl } from './asset-url';
export type MuseChannel = 0 | 1 | 2 | 3;
export type CalibrationData = {
  deviceId: string;
  sampleRate: number;
  channelCount: number;
  alphaMean: number;
  alphaStd: number;
  varianceMean: number;
  varianceMedian: number;
  ratioMean: number;
  ratioStd: number;
  sampleCount: number;
  timestamp: number;
};
export type CalmReading = {
  activity: number;
  alpha: number;
  theta: number;
  beta: number;
  ratio: number;
  alphaVariance: number;
  zRatio: number;
  calibrated: boolean;
  calibrating: boolean;
  calibrationProgress: number;
  quality: number[];
  lastUpdate: number;
};
type Exports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  eeg_abi(): number;
  eeg_new(): number;
  eeg_free(p: number): void;
  eeg_input(p: number): number;
  eeg_reading(p: number): number;
  eeg_calibration(p: number): number;
  eeg_revision(p: number): number;
  eeg_start(p: number): void;
  eeg_load_calibration(p: number): number;
  eeg_push(
    p: number,
    ch: number,
    n: number,
    mono: number,
    wall: number,
  ): number;
  eeg_spectrum(p: number, n: number): number;
};
const fields = [
  'sampleRate',
  'channelCount',
  'alphaMean',
  'alphaStd',
  'varianceMean',
  'varianceMedian',
  'ratioMean',
  'ratioStd',
  'sampleCount',
  'timestamp',
] as const;
const PREFIX = 'mindfly:muse2:rust-v1:calibration:';
let loaded: Promise<WebAssembly.Module> | null = null;
let ready: WebAssembly.Module | null = null;
export async function prepareEegWasm(): Promise<WebAssembly.Module> {
  if (ready) return ready;
  if (!loaded)
    loaded = (async () => {
      const r = await fetch(assetUrl('/wasm/eeg-engine.wasm'), {
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok)
        throw Error(`EEG module download failed (${r.status}). Please retry.`);
      const m = await WebAssembly.compile(await r.arrayBuffer());
      const check = new CalmEngine(new WebAssembly.Instance(m, {}));
      check.dispose();
      ready = m;
      return m;
    })().catch((e) => {
      loaded = null;
      throw e;
    });
  return loaded;
}
export function eegWasmReady() {
  return ready !== null;
}
export class CalmEngine {
  private x: Exports;
  private p: number;
  private listeners = new Set<(r: CalmReading) => void>();
  private device = 'Muse 2';
  private saved = '';
  constructor(instance?: WebAssembly.Instance) {
    if (!instance && !ready)
      throw Error('EEG module is not ready. Please retry.');
    this.x = (instance ?? new WebAssembly.Instance(ready!, {}))
      .exports as Exports;
    const required = [
      'eeg_abi',
      'eeg_new',
      'eeg_free',
      'eeg_input',
      'eeg_reading',
      'eeg_calibration',
      'eeg_revision',
      'eeg_start',
      'eeg_load_calibration',
      'eeg_push',
      'eeg_spectrum',
    ];
    if (
      !(this.x.memory instanceof WebAssembly.Memory) ||
      required.some((k) => typeof this.x[k] !== 'function') ||
      this.x.eeg_abi() !== 1
    )
      throw Error('Unsupported EEG module. Please reload.');
    this.p = this.x.eeg_new();
    if (!this.p) throw Error('EEG module allocation failed.');
  }
  private check() {
    if (!this.p) throw Error('EEG engine disposed');
  }
  private input(v: readonly number[]) {
    this.check();
    if (v.length > 4096) throw Error('EEG packet too large');
    new Float64Array(
      this.x.memory.buffer,
      this.x.eeg_input(this.p),
      v.length,
    ).set(v);
  }
  get reading(): CalmReading {
    this.check();
    const r = new Float64Array(
      this.x.memory.buffer,
      this.x.eeg_reading(this.p),
      15,
    );
    return {
      activity: r[0],
      alpha: r[1],
      theta: r[2],
      beta: r[3],
      ratio: r[4],
      alphaVariance: r[5],
      zRatio: r[6],
      calibrated: r[7] === 1,
      calibrating: r[8] === 1,
      calibrationProgress: r[9],
      quality: Array.from(r.slice(10, 14)),
      lastUpdate: r[14],
    };
  }
  get calibration(): CalibrationData | null {
    if (!this.reading.calibrated) return null;
    const v = new Float64Array(
      this.x.memory.buffer,
      this.x.eeg_calibration(this.p),
      10,
    );
    return Object.fromEntries([
      ['deviceId', this.device],
      ...fields.map((key, i) => [key, v[i]]),
    ]) as CalibrationData;
  }
  subscribe(fn: (r: CalmReading) => void) {
    this.listeners.add(fn);
    fn(this.reading);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    const r = this.reading;
    const cal = this.calibration;
    if (cal) {
      const json = JSON.stringify(cal);
      if (json !== this.saved) {
        try {
          localStorage.setItem(PREFIX + this.device, json);
        } catch {}
        this.saved = json;
      }
    }
    for (const fn of this.listeners) fn({ ...r, quality: [...r.quality] });
  }
  setDevice(id: string, refresh = true) {
    this.device = id || 'Muse 2';
    try {
      const raw = localStorage.getItem(PREFIX + this.device);
      const c = raw ? JSON.parse(raw) : null;
      if (c?.deviceId === this.device) {
        this.input(fields.map((k) => c[k]));
        if (this.x.eeg_load_calibration(this.p)) {
          this.saved = JSON.stringify(this.calibration);
          this.emit();
        }
      }
    } catch {}
    if (refresh || !this.isCalibrated()) this.startCalibration();
  }
  startCalibration() {
    this.check();
    this.x.eeg_start(this.p);
    this.emit();
  }
  isCalibrated() {
    return this.reading.calibrated;
  }
  push(ch: MuseChannel, samples: number[]) {
    this.check();
    if (!Number.isInteger(ch) || ch < 0 || ch > 3)
      throw Error('Invalid EEG channel');
    for (let i = 0; i < samples.length; i += 4096) {
      const v = samples.slice(i, i + 4096);
      this.input(v);
      const revision = this.x.eeg_revision(this.p);
      if (!this.x.eeg_push(this.p, ch, v.length, performance.now(), Date.now()))
        throw Error('EEG input rejected');
      if (this.x.eeg_revision(this.p) !== revision) this.emit();
    }
  }
  spectrum(samples: number[]) {
    if (samples.length !== 512)
      return { alpha: 0, beta: 0, theta: 0, quality: 0 };
    this.input(samples);
    const p = this.x.eeg_spectrum(this.p, samples.length);
    const v = new Float64Array(this.x.memory.buffer, p, 4);
    return { alpha: v[0], beta: v[1], theta: v[2], quality: v[3] };
  }
  dispose() {
    if (this.p) {
      this.x.eeg_free(this.p);
      this.p = 0;
    }
    this.listeners.clear();
  }
}
let displayEngine: CalmEngine | null = null;
export function spectrumFeatures(channels: number[][]) {
  if (!ready)
    return {
      channelPowers: channels.map(() => ({ alpha: 0, beta: 0, theta: 0 })),
      quality: channels.map(() => 0),
    };
  displayEngine ??= new CalmEngine();
  const powers = channels.map((v) => displayEngine!.spectrum(v));
  return { channelPowers: powers, quality: powers.map((p) => p.quality) };
}
