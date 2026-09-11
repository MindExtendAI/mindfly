export type Vector3 = [number, number, number];
export type WalkingState = {
  heading: number;
  position: Vector3;
  velocity: Vector3;
  time: number;
  distance: number;
  trail: Vector3[];
};

export type WalkingGate = {
  stimulating: boolean;
  elapsed: number;
  remaining: number;
  waitingRelease: boolean;
};
export const initialWalkingGate = (): WalkingGate => ({
  stimulating: false,
  elapsed: 0,
  remaining: 0,
  waitingRelease: false,
});

/** Application trigger: fixed 10 Hz, max 30 s, release to rearm. */
export function advanceWalkingGate(
  previous: WalkingGate,
  focus: number,
  usable: boolean,
): WalkingGate {
  const high = usable && Number.isFinite(focus) && focus >= 0.65;
  if (!high) return initialWalkingGate();
  if (previous.waitingRelease) return previous;
  const elapsed = previous.elapsed + 0.05;
  if (elapsed > 30 + 1e-8)
    return {
      stimulating: false,
      elapsed: 30,
      remaining: 0,
      waitingRelease: true,
    };
  return {
    stimulating: true,
    elapsed,
    remaining: Math.max(0, 30 - elapsed),
    waitingRelease: false,
  };
}

export const WALKING_ARENA_RADIUS = 22;
export function initialBpnWalking(): WalkingState {
  const position: Vector3 = [-9, 0, -4];
  return {
    position,
    velocity: [0, 0, 0],
    heading: 0,
    time: 0,
    distance: 0,
    trail: [[...position]],
  };
}
const angleDifference = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** BPN supplies forward drive, not a goal location. The arena boundary response
 * and command-to-speed scale are authored kinematics, not recovered physiology. */
export function advanceBpnWalking(
  previous: WalkingState,
  forward: number,
  dt: number,
  enabled: boolean,
): WalkingState {
  if (!enabled || ![forward, dt].every(Number.isFinite) || dt <= 0)
    return { ...previous, velocity: [0, 0, 0] };
  const step = Math.min(dt, 0.1);
  const desiredSpeed =
    forward > 0.01 ? Math.min(1, Math.max(0, forward)) * 90 : 0;
  const oldSpeed = Math.hypot(...previous.velocity);
  const speed =
    desiredSpeed === 0
      ? 0
      : oldSpeed + (desiredSpeed - oldSpeed) * (1 - Math.exp(-step / 0.12));
  const p = previous.position;
  let heading =
    previous.heading ??
    (oldSpeed > 0.01
      ? Math.atan2(previous.velocity[2], previous.velocity[0])
      : 0);
  const radius = Math.hypot(p[0], p[2]);
  if (speed > 0 && radius > WALKING_ARENA_RADIUS - 3) {
    const radial = Math.atan2(p[2], p[0]);
    const side = Math.sin(heading - radial) >= 0 ? 1 : -1;
    const desired = radial + side * (Math.PI / 2 + 0.22);
    heading += Math.max(
      -1.8 * step,
      Math.min(1.8 * step, angleDifference(desired, heading)),
    );
  }
  const position: Vector3 = [
    p[0] + Math.cos(heading) * speed * step,
    0,
    p[2] + Math.sin(heading) * speed * step,
  ];
  const r = Math.hypot(position[0], position[2]);
  if (r > WALKING_ARENA_RADIUS - 1.2) {
    position[0] *= (WALKING_ARENA_RADIUS - 1.2) / r;
    position[2] *= (WALKING_ARENA_RADIUS - 1.2) / r;
  }
  const velocity: Vector3 = [
    (position[0] - p[0]) / step,
    0,
    (position[2] - p[2]) / step,
  ];
  return {
    ...previous,
    time: previous.time + step,
    position,
    velocity,
    heading,
    distance:
      previous.distance + Math.hypot(position[0] - p[0], position[2] - p[2]),
    trail:
      speed > 0
        ? [...previous.trail.slice(-179), [...position] as Vector3]
        : previous.trail,
  };
}
