import { spectrumFeatures } from './eeg-wasm';

export const EEG_CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10'] as const;
export type EegDisplay = {
  source: 'live' | 'demo' | 'none';
  channels: { name: string; valid: boolean; relativeAlpha: number | null }[];
};
/** Read-only channel visualization using the bundled EEG module. */
export function eegDisplay(
  samples: number[][],
  fresh: boolean[],
  source: EegDisplay['source'],
): EegDisplay {
  const windows = EEG_CHANNELS.map((_, i) => (samples[i] ?? []).slice(-512));
  const f = spectrumFeatures(windows);
  return {
    source,
    channels: EEG_CHANNELS.map((name, i) => {
      const p = f.channelPowers[i];
      const total = p.alpha + p.beta + p.theta;
      const valid =
        source !== 'none' && !!fresh[i] && f.quality[i] === 1 && total > 0;
      return { name, valid, relativeAlpha: valid ? p.alpha / total : null };
    }),
  };
}
/** Synthetic signal for the labeled demo ONLY. Same samples supply both the
 * displayed waveform and spectral readout. Does not model a person's EEG. */
export function demoEegSamples(seconds: number, focus: number): number[][] {
  const f = Math.max(0, Math.min(1, focus));
  return EEG_CHANNELS.map((_, ch) =>
    Array.from({ length: 512 }, (_, i) => {
      const t = seconds + (i - 511) / 256;
      const alpha = (6 + 14 * f) * (ch === 0 || ch === 3 ? 1 : 0.75);
      return (
        alpha * Math.sin(2 * Math.PI * 10 * t + ch * 0.7) +
        5 * Math.sin(2 * Math.PI * 6 * t + ch) +
        (10 - 6 * f) * Math.sin(2 * Math.PI * 20 * t + ch * 0.2)
      );
    }),
  );
}
