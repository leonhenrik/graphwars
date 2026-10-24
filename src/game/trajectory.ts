import { MAX_JUMP_PER_STEP, SAMPLE_STEP } from './constants';
import type { Bounds, ShotDirection, Trajectory, TrajectoryEnd, TrajectoryPoint } from './types';

export type TrajectoryResult =
  | { ok: true; trajectory: Trajectory }
  | { ok: false; error: string };

/**
 * Builds the trajectory for a shooter at world position (x0, y0).
 *
 * Coordinate system: the shooter is ALWAYS the origin (0, 0) of the function. With local coordinate
 *   u = direction * (X - x0)
 * (so u grows in the direction of travel), the world curve is
 *   Y(u) = y0 + f(u) - f(0)
 * i.e. the entered f is evaluated in local coordinates and shifted vertically so it passes through
 * the shooter (c = -f(0) in local terms, equivalent to c = y0 - f(x0) in world terms).
 *
 * Direction: `direction` = +1 travels towards increasing world X (right) and evaluates f on u = X - x0;
 * -1 travels left and mirrors the function (u = x0 - X).
 *
 * Sampling starts at the shooter and moves in SAMPLE_STEP increments until the curve:
 *   - reaches the left/right battlefield edge          -> end 'boundary'
 *   - leaves the battlefield vertically                -> end 'out-of-bounds'
 *   - evaluates to NaN/Infinity                        -> end 'undefined-value'
 *   - jumps by more than MAX_JUMP_PER_STEP in one step -> end 'discontinuity'
 * Nothing here throws for bad math; the evaluator is wrapped defensively.
 */
export function computeTrajectory(
  evaluate: (u: number) => number,
  origin: TrajectoryPoint,
  direction: ShotDirection,
  bounds: Bounds,
  step: number = SAMPLE_STEP,
): TrajectoryResult {
  const safeEval = (u: number): number => {
    try {
      return evaluate(u);
    } catch {
      return Number.NaN;
    }
  };

  const f0 = safeEval(0);
  if (!Number.isFinite(f0)) {
    return { ok: false, error: 'The function is undefined at x = 0 (your position). Try another function.' };
  }

  const points: TrajectoryPoint[] = [{ x: origin.x, y: origin.y }];
  const uEdge = direction === 1 ? bounds.maxX - origin.x : origin.x - bounds.minX;
  const maxSteps = Math.ceil(Math.max(uEdge, 0) / step) + 2;
  let end: TrajectoryEnd = 'boundary';

  for (let k = 1; k <= maxSteps; k++) {
    let u = k * step;
    const pastEdge = u >= uEdge;
    if (pastEdge) u = uEdge;
    if (u <= 0) break;

    const x = origin.x + direction * u;
    const y = origin.y + safeEval(u) - f0;
    const prev = points[points.length - 1] as TrajectoryPoint;

    if (!Number.isFinite(y)) {
      end = 'undefined-value';
      break;
    }
    if (y < bounds.minY || y > bounds.maxY) {
      end = 'out-of-bounds';
      break;
    }
    if (Math.abs(y - prev.y) > MAX_JUMP_PER_STEP) {
      end = 'discontinuity';
      break;
    }

    points.push({ x, y });
    if (pastEdge) {
      end = 'boundary';
      break;
    }
  }

  return { ok: true, trajectory: { points, end } };
}

/** A trajectory needs at least one segment to be worth firing. */
export function isUsableTrajectory(trajectory: Trajectory): boolean {
  return trajectory.points.length >= 2;
}

export function describeTrajectoryEnd(end: TrajectoryEnd): string {
  switch (end) {
    case 'boundary':
      return 'reaches the edge of the battlefield';
    case 'out-of-bounds':
      return 'leaves the battlefield vertically';
    case 'undefined-value':
      return 'hits a point where the function is undefined';
    case 'discontinuity':
      return 'hits a discontinuity';
  }
}
