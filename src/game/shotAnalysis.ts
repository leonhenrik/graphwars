import { findFirstCollision, type CircleTarget } from './collision';
import { SOLDIER_RADIUS } from './constants';
import { parseExpression } from './expressionParser';
import { computeTrajectory } from './trajectory';
import type { Bounds, Obstacle, ShotDirection, TrajectoryPoint } from './types';

/**
 * Static analysis of a battlefield layout.
 *
 * 1. hasLinearShot(a, b, obstacles) decides, exactly, whether ANY straight line y = m*x + c through
 *    shooter `a` hits target `b` before an obstacle. Every ray from `a` that hits the disc of `b`
 *    lies in an angular interval [phi - h, phi + h], h = asin(r / d). Every obstacle O in front of b
 *    blocks the angular interval [psi - k, psi + k], k = asin(rO / dO). Because the discs are
 *    disjoint, the order in which one ray meets two discs is the same for all rays in their common
 *    interval, so it is decided at one ray. The line is "closed" iff the blocking intervals cover
 *    b's interval completely (a 1-D interval-union test, no sampling).
 *
 * 2. findShotWitness(...) constructs an explicit, safe function that DOES reach the target: an
 *    x-monotone polyline that keeps a clearance margin from every obstacle and every other player,
 *    found by dynamic programming over a visibility graph and encoded as
 *    a*x + k1*abs(x-u1) + k2*abs(x-u2) + ... (any piecewise-linear function has this form). The
 *    witness is then re-checked through the real parser/trajectory/collision pipeline, so a
 *    returned witness is a proof that the shot is possible.
 */

/** Rays this close (radians) to the edge of the target's cone are also required to be blocked. */
const ANGLE_MARGIN = 0.005;

const MIN_DX = 3;
const PATH_MARGIN = 0.5;
const MAX_SLOPE = 30;
const MAX_BREAKPOINTS = 4;
const EDGE_EPS = 1e-6;

export const MIN_HORIZONTAL_SEPARATION = MIN_DX;

export interface LayoutSoldier {
  id: string;
  x: number;
  y: number;
}

export interface Witness {
  direction: ShotDirection;
  /** Expression a player could type; passes the real parser limits. */
  expression: string;
  /** The intended path in world coordinates, from shooter to target centre. */
  vertices: TrajectoryPoint[];
}

function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

function rayEntry(centerDistance: number, radius: number, gamma: number): number {
  const s = centerDistance * Math.sin(gamma);
  const disc = radius * radius - s * s;
  return disc < 0 ? Number.NaN : centerDistance * Math.cos(gamma) - Math.sqrt(disc);
}

export function hasLinearShot(
  a: TrajectoryPoint,
  b: TrajectoryPoint,
  obstacles: Obstacle[],
  targetRadius: number = SOLDIER_RADIUS,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= targetRadius) return true;
  const phi = Math.atan2(dy, dx);
  const halfReal = Math.asin(targetRadius / d);
  const half = halfReal + ANGLE_MARGIN;

  const blocked: Array<[number, number]> = [];
  for (const o of obstacles) {
    const ox = o.x - a.x;
    const oy = o.y - a.y;
    const dO = Math.hypot(ox, oy);
    if (dO <= o.radius) continue;
    const psi = normalizeAngle(Math.atan2(oy, ox) - phi);
    const k = Math.asin(o.radius / dO);
    const start = Math.max(-half, psi - k);
    const end = Math.min(half, psi + k);
    if (start >= end) continue;

    const mid = (start + end) / 2;
    const tObstacle = rayEntry(dO, o.radius, mid - psi);
    const tTarget = rayEntry(d, targetRadius, Math.max(-halfReal, Math.min(halfReal, mid)));
    if (tObstacle < tTarget) blocked.push([start, end]);
  }

  blocked.sort((p, q) => p[0] - q[0]);
  let covered = -half;
  for (const [s, e] of blocked) {
    if (s > covered + 1e-12) return true;
    covered = Math.max(covered, e);
  }
  return covered < half - 1e-12;
}

/** Returns the id of the first target hit by `expression`, or null if nothing is hit or it is invalid. */
export function firstHitId(
  expression: string,
  direction: ShotDirection,
  shooter: TrajectoryPoint,
  targets: CircleTarget[],
  bounds: Bounds,
): string | null {
  const parsed = parseExpression(expression);
  if (!parsed.ok) return null;
  const result = computeTrajectory(parsed.evaluate, shooter, direction, bounds);
  if (!result.ok || result.trajectory.points.length < 2) return null;
  return findFirstCollision(result.trajectory.points, targets)?.target.id ?? null;
}

interface Disc {
  u: number;
  v: number;
  r: number;
}

interface Node {
  u: number;
  v: number;
}

function segmentDistance(p: Node, q: Node, c: Disc): number {
  const du = q.u - p.u;
  const dv = q.v - p.v;
  const len2 = du * du + dv * dv;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.u - p.u) * du + (c.v - p.v) * dv) / len2));
  return Math.hypot(p.u + du * t - c.u, p.v + dv * t - c.v);
}

function fmt(n: number): number {
  return Number(n.toFixed(3));
}

function buildExpression(vertices: Node[]): string {
  const slopes: number[] = [];
  for (let i = 0; i + 1 < vertices.length; i++) {
    const p = vertices[i] as Node;
    const q = vertices[i + 1] as Node;
    slopes.push((q.v - p.v) / (q.u - p.u));
  }
  const first = slopes[0] as number;
  const last = slopes[slopes.length - 1] as number;

  const terms: string[] = [];
  const push = (coefficient: number, body: string) => {
    const c = fmt(coefficient);
    if (c === 0) return;
    const text = `${Math.abs(c)}*${body}`;
    terms.push(terms.length === 0 ? (c < 0 ? `-${text}` : text) : ` ${c < 0 ? '-' : '+'} ${text}`);
  };

  push((first + last) / 2, 'x');
  for (let i = 1; i < slopes.length; i++) {
    const u = (vertices[i] as Node).u;
    push(((slopes[i] as number) - (slopes[i - 1] as number)) / 2, `abs(x-${u})`);
  }
  return terms.length === 0 ? '0' : terms.join('');
}

/**
 * Finds a verified function with which `from` hits `to` first (before any obstacle or other soldier),
 * or null if none was found. Intended for layout validation, not for the game loop.
 */
export function findShotWitness(
  from: LayoutSoldier,
  to: LayoutSoldier,
  soldiers: LayoutSoldier[],
  obstacles: Obstacle[],
  bounds: Bounds,
): Witness | null {
  const dx = to.x - from.x;
  if (Math.abs(dx) < MIN_DX) return null;
  const direction: ShotDirection = dx > 0 ? 1 : -1;
  const toLocal = (x: number, y: number): Node => ({ u: direction * (x - from.x), v: y - from.y });
  const toWorld = (n: Node): TrajectoryPoint => ({ x: from.x + direction * n.u, y: from.y + n.v });

  const blockers: Disc[] = [
    ...obstacles.map((o) => ({ ...toLocal(o.x, o.y), r: o.radius + PATH_MARGIN })),
    ...soldiers
      .filter((s) => s.id !== from.id && s.id !== to.id)
      .map((s) => ({ ...toLocal(s.x, s.y), r: SOLDIER_RADIUS + PATH_MARGIN })),
  ];

  const goal = toLocal(to.x, to.y);
  const start: Node = { u: 0, v: 0 };

  const waypoints: Node[] = [];
  for (const c of blockers) {
    const circumradius = c.r / Math.cos(Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const angle = (Math.PI / 4) * k + Math.PI / 8;
      const node = { u: c.u + circumradius * Math.cos(angle), v: c.v + circumradius * Math.sin(angle) };
      if (node.u <= 0.05 || node.u >= goal.u - 0.05) continue;
      const world = toWorld(node);
      if (
        world.x < bounds.minX + 0.3 ||
        world.x > bounds.maxX - 0.3 ||
        world.y < bounds.minY + 0.3 ||
        world.y > bounds.maxY - 0.3
      ) {
        continue;
      }
      if (blockers.some((o) => Math.hypot(node.u - o.u, node.v - o.v) < o.r - EDGE_EPS)) continue;
      waypoints.push(node);
    }
  }
  waypoints.sort((p, q) => p.u - q.u || p.v - q.v);
  const nodes: Node[] = [start, ...waypoints, goal];

  const edgeOk = (p: Node, q: Node): boolean => {
    const du = q.u - p.u;
    if (du < 0.05 || Math.abs(q.v - p.v) / du > MAX_SLOPE) return false;
    return blockers.every((c) => segmentDistance(p, q, c) >= c.r - EDGE_EPS);
  };

  // Cost = 1000 per vertex (fewest breakpoints first) + path length (shortest among those).
  const best: number[] = nodes.map(() => Number.POSITIVE_INFINITY);
  const prev: number[] = nodes.map(() => -1);
  best[0] = 0;
  for (let j = 1; j < nodes.length; j++) {
    const q = nodes[j] as Node;
    for (let i = 0; i < j; i++) {
      const bi = best[i] as number;
      if (!Number.isFinite(bi)) continue;
      const p = nodes[i] as Node;
      const cost = bi + 1000 + Math.hypot(q.u - p.u, q.v - p.v);
      if (cost < (best[j] as number) && edgeOk(p, q)) {
        best[j] = cost;
        prev[j] = i;
      }
    }
  }
  if (!Number.isFinite(best[nodes.length - 1] as number)) return null;

  const path: Node[] = [];
  for (let at = nodes.length - 1; at >= 0; at = prev[at] as number) {
    path.push(nodes[at] as Node);
    if (at === 0) break;
  }
  path.reverse();
  if (path.length - 2 > MAX_BREAKPOINTS) return null;

  const rounded = path.map((n, i) => (i === 0 || i === path.length - 1 ? n : { u: Math.round(n.u * 100) / 100, v: n.v }));
  const expression = buildExpression(rounded);

  const targets: CircleTarget[] = [
    ...soldiers
      .filter((s) => s.id !== from.id)
      .map((s): CircleTarget => ({ id: s.id, kind: 'soldier', x: s.x, y: s.y, radius: SOLDIER_RADIUS })),
    ...obstacles.map((o): CircleTarget => ({ id: o.id, kind: 'obstacle', x: o.x, y: o.y, radius: o.radius })),
  ];
  if (firstHitId(expression, direction, from, targets, bounds) !== to.id) return null;

  return { direction, expression, vertices: rounded.map(toWorld) };
}
