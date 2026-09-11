import type { CircuitData } from './anatomy';

export type BpnData = CircuitData & {
  engineCommit: string;
  graphSha256: string;
  forwardTerms: {
    type: string;
    weight: number;
    populationSize: number;
    indices: number[];
  }[];
};
export type ModelSpike = { neuron: number; offsetMs: number };
export type BpnOutput = {
  forward: number;
  inputHz: number;
  targetSpikes: number;
  totalSpikes: number;
  active: Float32Array;
  pulses: number;
  /** Actual per-neuron spike counts in the completed 50 ms model bin. */
  spikeCounts: Uint32Array;
  /** Emission times within this 50 ms bin, at the model’s 0.5 ms resolution. */
  spikeEvents: ModelSpike[];
};
