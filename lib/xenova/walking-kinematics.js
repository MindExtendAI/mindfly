/** Kinematic approximation informed by DeAngelis et al. 2019 (eLife 46409)
 * and Bidaye 2020 Fig 7D. Not fitted joint trajectories or simulated muscles.
 * Fixed 40 ms swing; increased speed shortens stance. Paired left/right legs
 * alternate, with a posterior-to-anterior phase lag at slower speeds.
 */
export function walkingTiming(speed) {
  const v = Math.max(0, Math.abs(speed));
  if (v < 0.02) return { frequency: 0, duty: 1, stride: 0, lag: 0.12 };
  const stance = Math.max(0.04, Math.min(0.21, 0.55 / v));
  const swing = 0.04;
  const period = stance + swing;
  return {
    frequency: 1 / period,
    duty: stance / period,
    stride: Math.min(0.9, v * stance),
    lag: 0.12 * Math.max(0, 1 - v / 15),
  };
}
export function walkingFoot(phaseRadians, speed, legIndex) {
  const timing = walkingTiming(speed);
  const offsets = [
    timing.lag * 2,
    0.5 + timing.lag,
    0,
    0.5 + timing.lag * 2,
    timing.lag,
    0.5,
  ];
  const phase =
    (((phaseRadians / (Math.PI * 2) + offsets[legIndex]) % 1) + 1) % 1;
  const swinging = timing.frequency > 0 && phase > timing.duty;
  const u = swinging ? (phase - timing.duty) / (1 - timing.duty) : 0;
  const x = swinging
    ? timing.stride * (-0.5 + u - Math.sin(2 * Math.PI * u) / (2 * Math.PI))
    : timing.stride * (0.5 - phase / timing.duty);
  return {
    x,
    lift: swinging ? 0.18 * Math.sin(Math.PI * u) : 0,
    swinging,
    ...timing,
  };
}
