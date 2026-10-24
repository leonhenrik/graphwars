import { MAX_JUMP_PER_STEP, SAMPLE_STEP } from './constants';
import type { Bounds, ShotDirection, Trajectory, TrajectoryEnd, TrajectoryPoint } from './types';

export type TrajectoryResult =
  | { ok: true; trajectory: Trajectory }
  | { ok: false; error: string };

/**
 * Builds the trajectory y(x) = f(x) + c, with c = y0 - f(x0), so the curve passes through the
 * shooter at (x0, y0). `x` is the absolute battlefield x-coordinate.
 *
 * Direction: `direction` = +1 samples x upwards (shot travels right), -1 samples x downwards
 * (shot travels left). Player 1 (left side) shoots right, Player 2 (right side) shoots left.
 *
 * Sampling starts at the shooter and moves in SAMPLE_STEP increments until the curve:
 *   - reaches the left/right battlefield edge          -> end 'boundary'
 *   - leaves the battlefield vertically                -> end 'out-of-bounds'
 *   - evaluates to NaN/Infinity                        -> end 'undefined-value'
 *   - jumps by more than MAX_JUMP_PER_STEP in one step -> end 'discontinuity'
 * Nothing here throws for bad math; the evaluator is wrapped defensively.
 */
export function computeTrajectory(
  evaluate: (x: number) => number,
  origin: TrajectoryPoint,
  direction: ShotDirection,
  bounds: Bounds,
  step: number = SAMPLE_STEP,
): TrajectoryResult {
  const safeEval = (x: number): number => {
    try {
      return evaluate(x);
    } catch {
      return Number.NaN;
    }
  };

  const f0 = safeEval(origin.x);
  if (!Number.isFinite(f0)) {
    return { ok: false, error: `The function is undefined at the shooter's position (x = ${round(origin.x)}).` };
  }
  const c = origin.y - f0;

  const points: TrajectoryPoint[] = [{ x: origin.x, y: origin.y }];
  const edgeX = direction === 1 ? bounds.maxX : bounds.minX;
  const maxSteps = Math.ceil((bounds.maxX - bounds.minX) / step) + 2;
  let end: TrajectoryEnd = 'boundary';

  for (let k = 1; k <= maxSteps; k++) {
    let x = origin.x + direction * k * step;
    const pastEdge = direction === 1 ? x >= edgeX : x <= edgeX;
    if (pastEdge) x = edgeX;

    const fx = safeEval(x);
    const y = fx + c;
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

    if (x !== prev.x) points.push({ x, y });
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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
