/** A smooth 40-second round trip: 30% -> 90% -> 30%. */
export const DEMO_CYCLE_SECONDS = 40;
export function demoFocusAt(seconds: number) {
  if (!Number.isFinite(seconds)) return 0.3;
  return (
    0.3 + 0.3 * (1 - Math.cos((2 * Math.PI * seconds) / DEMO_CYCLE_SECONDS))
  );
}
