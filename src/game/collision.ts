import type { Obstacle, Soldier, TrajectoryPoint } from './types';

export interface CircleTarget {
  id: string;
  kind: 'soldier' | 'obstacle';
  x: number;
  y: number;
  radius: number;
}

export interface Collision {
  target: CircleTarget;
  point: TrajectoryPoint;
  /** Index of the segment start (points[segmentIndex] -> points[segmentIndex + 1]). */
  segmentIndex: number;
  /** Fraction along that segment, 0..1. */
  t: number;
}

/**
 * Smallest t in [0,1] at which the segment a->b is inside the circle, or null.
 * If `a` is already inside the circle, returns 0.
 */
export function segmentCircleEntry(
  a: TrajectoryPoint,
  b: TrajectoryPoint,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - cx;
  const fy = a.y - cy;
  const r2 = radius * radius;

  const c = fx * fx + fy * fy - r2;
  if (c <= 0) return 0;

  const A = dx * dx + dy * dy;
  if (A === 0) return null;
  const B = 2 * (fx * dx + fy * dy);
  const disc = B * B - 4 * A * c;
  if (disc < 0) return null;

  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}

export function soldierTarget(s: Soldier): CircleTarget {
  return { id: s.id, kind: 'soldier', x: s.x, y: s.y, radius: s.radius };
}

export function obstacleTarget(o: Obstacle): CircleTarget {
  return { id: o.id, kind: 'obstacle', x: o.x, y: o.y, radius: o.radius };
}

/**
 * Walks the polyline from the shooter outwards and returns the FIRST collision. Within one segment
 * the target entered earliest wins; exact ties are broken by order in `targets` (deterministic).
 */
export function findFirstCollision(points: TrajectoryPoint[], targets: CircleTarget[]): Collision | null {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as TrajectoryPoint;
    const b = points[i + 1] as TrajectoryPoint;
    let best: Collision | null = null;
    for (const target of targets) {
      const t = segmentCircleEntry(a, b, target.x, target.y, target.radius);
      if (t === null) continue;
      if (best === null || t < best.t) {
        best = {
          target,
          t,
          segmentIndex: i,
          point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        };
      }
    }
    if (best) return best;
  }
  return null;
}
