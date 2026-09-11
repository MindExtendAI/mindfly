/** Display timing only; the circuit owns the actual stimulation gate. */
export const STIMULATION_PERIOD_MS = 100;
export const CONDUIT_TRAVEL_MS = 800;

/** Focus progress is UI feedback, not subthreshold optogenetic stimulation. */
export function conduitFeedback(
  focus: number,
  usable: boolean,
  stimulating: boolean,
) {
  if (!usable || !Number.isFinite(focus)) return { fill: 0, reachesFly: false };
  const reachesFly = focus >= 0.65 && stimulating;
  return {
    fill: Math.max(0, Math.min(focus / 0.65, reachesFly ? 1 : 0.99)),
    reachesFly,
  };
}

export class StimulationDisplay {
  private start: number | null = null;
  private resetId = -1;

  sample(now: number, active: boolean, resetId: number) {
    if (resetId !== this.resetId || !active) this.start = null;
    this.resetId = resetId;
    if (!active) return [];
    this.start ??= now;
    const elapsed = Math.max(0, now - this.start);
    const latest = Math.floor(elapsed / STIMULATION_PERIOD_MS);
    const pulses: { born: number; progress: number }[] = [];
    for (let i = latest; i >= Math.max(0, latest - 7); i--) {
      const born = this.start + i * STIMULATION_PERIOD_MS;
      pulses.push({ born, progress: (now - born) / CONDUIT_TRAVEL_MS });
    }
    return pulses;
  }
}
