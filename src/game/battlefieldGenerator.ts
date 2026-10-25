import { BOUNDS, SOLDIER_RADIUS } from './constants';
import {
  findShotWitness,
  hasLinearShot,
  MIN_HORIZONTAL_SEPARATION,
  type LayoutSoldier,
} from './shotAnalysis';
import type { Battlefield, MapId, Obstacle, TrajectoryPoint } from './types';

export interface MapInfo {
  id: MapId;
  name: string;
  description: string;
}

export const MAPS: MapInfo[] = [
  { id: 'classic', name: 'Classic', description: 'Players on a ring around a big  rock.' },
  { id: 'pillars', name: 'Pattern', description: 'A field of small pillars.' },
  { id: 'scatter', name: 'Scribbles', description: 'Random positions and blocks.' },
  { id: 'chaos', name: 'Chaos', description: 'Dense random blocks everywhere.' },
];

/** Minimum gap between an obstacle's edge and a soldier's edge, so nobody touches an obstacle. */
const CLEARANCE = 0.6;

export interface GeneratedMap {
  positions: TrajectoryPoint[];
  battlefield: Battlefield;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function ringPositions(n: number, rx: number, ry: number, phase: number): TrajectoryPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = Math.PI + phase + (2 * Math.PI * i) / n;
    return { x: round1(rx * Math.cos(angle)), y: round1(ry * Math.sin(angle)) };
  });
}

function scatterPositions(n: number, rand: () => number): TrajectoryPoint[] | null {
  const minDist = n <= 4 ? 13 : 10;
  const margin = 3;
  const points: TrajectoryPoint[] = [];
  for (let attempt = 0; attempt < 500 && points.length < n; attempt++) {
    const p = {
      x: round1(BOUNDS.minX + margin + rand() * (BOUNDS.maxX - BOUNDS.minX - 2 * margin)),
      y: round1(BOUNDS.minY + margin + rand() * (BOUNDS.maxY - BOUNDS.minY - 2 * margin)),
    };
    const ok = points.every(
      (q) => Math.hypot(q.x - p.x, q.y - p.y) >= minDist && Math.abs(q.x - p.x) >= MIN_HORIZONTAL_SEPARATION + 1,
    );
    if (ok) points.push(p);
  }
  return points.length === n ? points : null;
}

function fitsField(o: Obstacle, soldiers: TrajectoryPoint[]): boolean {
  if (
    o.x - o.radius < BOUNDS.minX + 0.2 ||
    o.x + o.radius > BOUNDS.maxX - 0.2 ||
    o.y - o.radius < BOUNDS.minY + 0.2 ||
    o.y + o.radius > BOUNDS.maxY - 0.2
  ) {
    return false;
  }
  return soldiers.every((s) => Math.hypot(s.x - o.x, s.y - o.y) >= o.radius + SOLDIER_RADIUS + CLEARANCE);
}

function templateObstacles(mapId: MapId, rand: () => number, soldiers: TrajectoryPoint[], attempt: number): Obstacle[] {
  const candidates: Array<Omit<Obstacle, 'id'>> = [];
  if (mapId === 'classic') {
    candidates.push(
      { x: 0, y: 0, radius: 3 },
      { x: -9, y: 8, radius: 1.8 },
      { x: 9, y: -8, radius: 1.8 },
      { x: -9, y: -8, radius: 1.8 },
      { x: 9, y: 8, radius: 1.8 },
    );
  } else if (mapId === 'pillars') {
    for (let ix = 0; ix < 5; ix++) {
      for (let iy = 0; iy < 3; iy++) {
        candidates.push({ x: -15 + ix * 7.5, y: -8 + iy * 8 + (ix % 2 === 0 ? 0 : 4), radius: 1.2 });
      }
    }
  } else if (mapId === 'chaos') {
    // Obstacles are scattered over the whole field, with guards crowding every soldier. The density
    // drops on later attempts so a valid layout is always found eventually.
    const target = Math.max(10, 22 - Math.floor(attempt / 6) * 2);
    const placed: Array<Omit<Obstacle, 'id'>> = [];
    const tryPlace = (x: number, y: number, radius: number) => {
      const apart = placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.radius + radius - 0.4);
      if (apart && fitsField({ id: '', x, y, radius }, soldiers)) placed.push({ x, y, radius });
    };
    for (const s of soldiers) {
      for (let guard = 0; guard < 2; guard++) {
        for (let tries = 0; tries < 20; tries++) {
          const radius = round1(1 + rand() * 1);
          const angle = rand() * Math.PI * 2;
          const dist = SOLDIER_RADIUS + CLEARANCE + radius + 0.4 + rand() * 2;
          const before = placed.length;
          tryPlace(round1(s.x + Math.cos(angle) * dist), round1(s.y + Math.sin(angle) * dist), radius);
          if (placed.length > before) break;
        }
      }
    }
    for (let tries = 0; tries < 600 && placed.length < target; tries++) {
      const radius = round1(0.9 + rand() * 1.9);
      const x = round1(BOUNDS.minX + radius + rand() * (BOUNDS.maxX - BOUNDS.minX - 2 * radius));
      const y = round1(BOUNDS.minY + radius + rand() * (BOUNDS.maxY - BOUNDS.minY - 2 * radius));
      tryPlace(x, y, radius);
    }
    candidates.push(...placed);
  } else {
    const count = 6 + Math.floor(rand() * 4);
    const placed: Array<Omit<Obstacle, 'id'>> = [];
    for (let attempt = 0; attempt < 300 && placed.length < count; attempt++) {
      const radius = round1(1.4 + rand() * 1.6);
      const x = round1(BOUNDS.minX + radius + rand() * (BOUNDS.maxX - BOUNDS.minX - 2 * radius));
      const y = round1(BOUNDS.minY + radius + rand() * (BOUNDS.maxY - BOUNDS.minY - 2 * radius));
      const apart = placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.radius + radius + 0.3);
      if (apart && fitsField({ id: '', x, y, radius }, soldiers)) placed.push({ x, y, radius });
    }
    candidates.push(...placed);
  }

  return candidates
    .map((c, i) => ({ id: `obstacle-${i + 1}`, ...c }))
    .filter((o) => fitsField(o, soldiers))
    .map((o, i) => ({ ...o, id: `obstacle-${i + 1}` }));
}

const hasAnyLinearShot = (a: TrajectoryPoint, b: TrajectoryPoint, obstacles: Obstacle[]) =>
  hasLinearShot(a, b, obstacles) || hasLinearShot(b, a, obstacles);

/** Adds the smallest obstacle on the line between every pair that still has a straight-line shot. */
function blockOpenLines(soldiers: TrajectoryPoint[], obstacles: Obstacle[]): boolean {
  for (let i = 0; i < soldiers.length; i++) {
    for (let j = i + 1; j < soldiers.length; j++) {
      const a = soldiers[i] as TrajectoryPoint;
      const b = soldiers[j] as TrajectoryPoint;
      if (!hasAnyLinearShot(a, b, obstacles)) continue;

      let placed = false;
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        for (const radius of [1.4, 1.8, 2.2, 2.6]) {
          const candidate: Obstacle = {
            id: `obstacle-${obstacles.length + 1}`,
            x: round1(a.x + (b.x - a.x) * t),
            y: round1(a.y + (b.y - a.y) * t),
            radius,
          };
          if (!fitsField(candidate, soldiers)) continue;
          if (hasAnyLinearShot(a, b, [...obstacles, candidate])) continue;
          obstacles.push(candidate);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) return false;
    }
  }
  return true;
}

function tryGenerate(mapId: MapId, n: number, attempt: number, rand: () => number): GeneratedMap | null {
  const phase = (attempt % 24) * 0.13;
  const positions =
    mapId === 'classic'
      ? ringPositions(n, 21, 11, phase)
      : mapId === 'pillars'
        ? ringPositions(n, 20, 10, 0.35 + phase)
        : scatterPositions(n, rand);
  if (!positions) return null;

  const obstacles = templateObstacles(mapId, rand, positions, attempt);
  if (!blockOpenLines(positions, obstacles)) return null;

  const battlefield: Battlefield = { bounds: { ...BOUNDS }, obstacles };
  return validateLayout(positions, battlefield).length === 0 ? { positions, battlefield } : null;
}

const cache = new Map<string, GeneratedMap>();

/**
 * Deterministic for a given (mapId, playerCount, seed). Every returned layout satisfies
 * validateLayout, i.e.
 *   - every soldier is at least CLEARANCE away from every obstacle (nobody touches an obstacle),
 *   - no player can hit another with ANY straight line (exact angular check, see shotAnalysis.ts),
 *   - every player can hit every other player with a verified function (constructive witness).
 */
export function generateMap(mapId: MapId, playerCount: number, seed: number): GeneratedMap {
  const key = `${mapId}:${playerCount}:${seed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let result: GeneratedMap | null = null;
  for (let attempt = 0; attempt < 80 && !result; attempt++) {
    result = tryGenerate(mapId, playerCount, attempt, mulberry32(seed + attempt * 7919));
  }
  if (!result && mapId !== 'classic') return generateMap('classic', playerCount, 1);
  if (!result) throw new Error(`Could not generate a ${mapId} map for ${playerCount} players.`);

  if (cache.size > 200) cache.clear();
  cache.set(key, result);
  return result;
}

function toLayoutSoldiers(positions: TrajectoryPoint[]): LayoutSoldier[] {
  return positions.map((p, i) => ({ id: `p${i + 1}`, x: p.x, y: p.y }));
}

/** Returns a list of rule violations; empty means the layout is valid. */
export function validateLayout(positions: TrajectoryPoint[], battlefield: Battlefield): string[] {
  const problems: string[] = [];
  const { bounds, obstacles } = battlefield;

  positions.forEach((p, i) => {
    if (p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) {
      problems.push(`Soldier ${i + 1} is outside the battlefield.`);
    }
    for (const o of obstacles) {
      if (Math.hypot(p.x - o.x, p.y - o.y) < o.radius + SOLDIER_RADIUS + CLEARANCE) {
        problems.push(`Soldier ${i + 1} touches ${o.id}.`);
      }
    }
  });

  const soldiers = toLayoutSoldiers(positions);
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      if (i === j) continue;
      const a = positions[i] as TrajectoryPoint;
      const b = positions[j] as TrajectoryPoint;
      if (hasLinearShot(a, b, obstacles)) {
        problems.push(`Soldier ${i + 1} can hit soldier ${j + 1} with a straight line.`);
      }
      if (problems.length > 0) continue;
      if (!findShotWitness(soldiers[i] as LayoutSoldier, soldiers[j] as LayoutSoldier, soldiers, obstacles, bounds)) {
        problems.push(`Soldier ${i + 1} cannot reach soldier ${j + 1} with any function.`);
      }
    }
  }
  return problems;
}
