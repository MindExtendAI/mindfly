/** Hold control only when both posterior contacts are poor. */
export function assessMuseQuality(
  times: number[],
  now: number,
  calibrated: boolean,
  _calibrating: boolean,
  quality: number[],
) {
  const fresh = Array.from(
    { length: 4 },
    (_, i) =>
      Number.isFinite(now) &&
      Number.isFinite(times[i]) &&
      times[i] > 0 &&
      now >= times[i] &&
      now - times[i] < 3000,
  );
  const posteriorReady =
    [0, 3].every((i) => fresh[i]) &&
    [0, 3].some((i) => Number.isFinite(quality[i]) && quality[i] >= 0.2);
  const level: 'good' | 'fair' | 'poor' = !posteriorReady
    ? 'poor'
    : fresh.every(Boolean) &&
        quality.length === 4 &&
        quality.every((q) => Number.isFinite(q) && q >= 1)
      ? 'good'
      : 'fair';
  return {
    fresh,
    posteriorReady,
    level,
    usable: posteriorReady && calibrated,
  };
}
