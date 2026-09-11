export type CircuitNode = {
  id: string;
  type: string;
  side: string;
  position: (number | null)[];
  input: boolean;
  motor: boolean;
};
export type CircuitData = {
  nodes: CircuitNode[];
  edges: number[][];
  inputs: number[];
  motors: number[];
};
export type AnatomyData = {
  totalNeurons: number;
  displayPoints: number;
  points: number[][];
  circuit: CircuitData;
};
export const clamp = (x: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, x));
