import type { Battlefield, Obstacle, TrajectoryPoint } from './types';

const RING_SAMPLES = 36;
/** Waypoints sit just outside each obstacle so a path can graze it without entering. */
const RING_SCALE = 1.02;

function distanceToSegment(p: TrajectoryPoint, a: TrajectoryPoint, b: TrajectoryPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}

function segmentClear(a: TrajectoryPoint, b: TrajectoryPoint, obstacles: Obstacle[]): boolean {
  return obstacles.every((o) => distanceToSegment(o, a, b) >= o.radius);
}

/**
 * Shortest path length from `from` to `to` that never enters an obstacle. Computed with Dijkstra over
 * the two endpoints plus sampled points around every obstacle; without obstacles this is the straight
 * distance. Returns Infinity if no path exists.
 */
export function idealPathLength(battlefield: Battlefield, from: TrajectoryPoint, to: TrajectoryPoint): number {
  const { obstacles } = battlefield;
  const nodes: TrajectoryPoint[] = [from, to];
  for (const o of obstacles) {
    for (let k = 0; k < RING_SAMPLES; k++) {
      const ang = (k / RING_SAMPLES) * Math.PI * 2;
      nodes.push({ x: o.x + Math.cos(ang) * o.radius * RING_SCALE, y: o.y + Math.sin(ang) * o.radius * RING_SCALE });
    }
  }

  const n = nodes.length;
  const dist = new Array<number>(n).fill(Infinity);
  const done = new Array<boolean>(n).fill(false);
  dist[0] = 0;

  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] !== Infinity && (u === -1 || (dist[i] as number) < (dist[u] as number))) u = i;
    }
    if (u === -1) return Infinity;
    if (u === 1) return dist[1] as number;
    done[u] = true;

    const current = nodes[u] as TrajectoryPoint;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const next = nodes[v] as TrajectoryPoint;
      const d = (dist[u] as number) + Math.hypot(next.x - current.x, next.y - current.y);
      if (d < (dist[v] as number) && segmentClear(current, next, obstacles)) dist[v] = d;
    }
  }
}

/**
 * Percentage of the ideal path a hitting shot achieved: the ideal shooter-to-target distance divided
 * by the distance the shot actually covered (path travelled plus the gap from impact to the target's
 * centre). 100 means the shot matched the ideal path; clamped to 0-100.
 */
export function shotAccuracy(
  battlefield: Battlefield,
  shooter: TrajectoryPoint,
  target: TrajectoryPoint,
  travelled: TrajectoryPoint[],
  impact: TrajectoryPoint,
): number {
  const ideal = idealPathLength(battlefield, shooter, target);
  let actual = Math.hypot(target.x - impact.x, target.y - impact.y);
  for (let i = 1; i < travelled.length; i++) {
    const a = travelled[i - 1] as TrajectoryPoint;
    const b = travelled[i] as TrajectoryPoint;
    actual += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (!(actual > 0) || !Number.isFinite(ideal)) return 0;
  return Math.max(0, Math.min(100, Math.round((ideal / actual) * 100)));
}
