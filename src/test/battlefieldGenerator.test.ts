import { describe, expect, it } from 'vitest';
import { generateMap, MAPS, validateLayout } from '../game/battlefieldGenerator';
import { MAX_EXPRESSION_LENGTH, MAX_PLAYERS, MIN_PLAYERS, SOLDIER_RADIUS } from '../game/constants';
import { createInitialState } from '../game/gameState';
import { simulateShot } from '../game/simulation';
import { findShotWitness, hasLinearShot, type LayoutSoldier } from '../game/shotAnalysis';
import type { GameState, MapId, Obstacle } from '../game/types';

const mapIds = MAPS.map((m) => m.id) as MapId[];
const playerCounts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

/** Fires `expression` as player `from` in an otherwise untouched match state. */
function shootAs(state: GameState, from: number, expression: string, direction: 1 | -1) {
  const s: GameState = { ...state, turn: { ...state.turn, currentPlayerId: from } };
  const r = simulateShot(s, `p${from}`, expression, direction);
  return r.ok ? r.shot : null;
}

function checkRequirements(state: GameState) {
  const layout: LayoutSoldier[] = state.soldiers.map((s) => ({ id: s.id, x: s.x, y: s.y }));
  const { obstacles, bounds } = state.battlefield;

  for (const a of state.soldiers) {
    for (const b of state.soldiers) {
      if (a.id === b.id) continue;

      // Requirement 1 (exact): no straight line from a reaches b first.
      expect(hasLinearShot(a, b, obstacles)).toBe(false);

      // Requirement 2 (constructive): an explicit function from a hits b first, through the real simulation.
      const w = findShotWitness(layout.find((l) => l.id === a.id)!, layout.find((l) => l.id === b.id)!, layout, obstacles, bounds);
      expect(w, `${a.id} -> ${b.id}`).not.toBeNull();
      expect(w!.expression.length).toBeLessThanOrEqual(MAX_EXPRESSION_LENGTH);
      const shot = shootAs(state, a.playerId, w!.expression, w!.direction);
      expect(shot?.outcome).toBe('hit-soldier');
      expect(shot?.targetId).toBe(b.id);
    }
  }
}

/** Independent numeric cross-check of requirement 1: fire many real straight lines through b's cone. */
function sampleLinearShots(state: GameState) {
  for (const a of state.soldiers) {
    for (const b of state.soldiers) {
      if (a.id === b.id) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const phi = Math.atan2(dy, dx);
      const half = Math.asin(SOLDIER_RADIUS / Math.hypot(dx, dy)) + 0.03;
      const direction = dx > 0 ? 1 : -1;
      for (let k = 0; k <= 120; k++) {
        const theta = phi - half + (2 * half * k) / 120;
        const slope = Math.tan(theta) * direction;
        if (!Number.isFinite(slope) || Math.abs(slope) > 150) continue;
        const shot = shootAs(state, a.playerId, `(${slope})*x`, direction);
        if (shot && shot.outcome === 'hit-soldier') expect(shot.targetId).not.toBe(b.id);
      }
    }
  }
}

describe('map generation', () => {
  for (const mapId of mapIds) {
    for (const n of playerCounts) {
      it(`${mapId} with ${n} players: valid layout, no straight-line hits, every player can reach every other`, () => {
        for (const seed of [1, 2, 3, 42, 1000]) {
          const state = createInitialState({ playerCount: n, mapId, seed });
          expect(state.soldiers).toHaveLength(n);
          expect(validateLayout(state.soldiers, state.battlefield)).toEqual([]);
          checkRequirements(state);
        }
      });
    }
  }

  it('numerically confirms that sampled straight lines never hit another player', () => {
    for (const mapId of mapIds) {
      for (const n of [2, 3, 5, 6]) {
        sampleLinearShots(createInitialState({ playerCount: n, mapId, seed: 11 }));
      }
    }
  });

  it('nobody touches an obstacle and players are not vertically aligned', () => {
    for (const mapId of mapIds) {
      for (const n of playerCounts) {
        const { positions, battlefield } = generateMap(mapId, n, 5);
        for (const p of positions) {
          for (const o of battlefield.obstacles) expect(Math.hypot(p.x - o.x, p.y - o.y)).toBeGreaterThan(o.radius + SOLDIER_RADIUS);
        }
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.abs(positions[i]!.x - positions[j]!.x)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('is deterministic for the same config and varies with the seed on the scatter map', () => {
    expect(generateMap('scatter', 4, 5)).toEqual(generateMap('scatter', 4, 5));
    expect(generateMap('scatter', 4, 5)).not.toEqual(generateMap('scatter', 4, 6));
    expect(generateMap('classic', 3, 1)).toEqual(generateMap('classic', 3, 99));
  });

  it('survives many random scatter seeds with every guarantee intact', () => {
    for (let seed = 0; seed < 40; seed++) {
      const n = playerCounts[seed % playerCounts.length]!;
      const { positions, battlefield } = generateMap('scatter', n, seed * 7 + 13);
      expect(validateLayout(positions, battlefield)).toEqual([]);
    }
  });

  it('validateLayout catches violations', () => {
    const base = generateMap('classic', 2, 1);
    expect(validateLayout(base.positions, { ...base.battlefield, obstacles: [] }).join()).toMatch(/straight line/);
    const touching: Obstacle = { id: 'x', x: base.positions[0]!.x, y: base.positions[0]!.y, radius: 1 };
    expect(validateLayout(base.positions, { ...base.battlefield, obstacles: [touching] }).join()).toMatch(/touches/);
  });

  it('builds one soldier per player, all alive, with matching colours and ids', () => {
    for (const n of playerCounts) {
      const s = createInitialState({ playerCount: n, mapId: 'classic', seed: 1 });
      expect(s.players).toHaveLength(n);
      expect(s.soldiers).toHaveLength(n);
      expect(s.soldiers.every((x) => x.alive)).toBe(true);
      expect(new Set(s.players.map((p) => p.color)).size).toBe(n);
      expect(s.soldiers.map((x) => x.playerId)).toEqual(s.players.map((p) => p.id));
    }
  });
});

describe('shotAnalysis', () => {
  const duel = [
    { id: 'a', x: -20, y: 0 },
    { id: 'b', x: 20, y: 0 },
  ];

  it('hasLinearShot: open field is open, a wide rock closes it, a tiny rock does not', () => {
    expect(hasLinearShot(duel[0]!, duel[1]!, [])).toBe(true);
    expect(hasLinearShot(duel[0]!, duel[1]!, [{ id: 'r', x: 0, y: 0, radius: 3 }])).toBe(false);
    expect(hasLinearShot(duel[0]!, duel[1]!, [{ id: 'r', x: 0, y: 0, radius: 0.3 }])).toBe(true);
  });

  it('hasLinearShot: an obstacle behind the target does not block', () => {
    expect(hasLinearShot(duel[0]!, duel[1]!, [{ id: 'r', x: 24, y: 0, radius: 3 }])).toBe(true);
  });

  it('hasLinearShot: two small rocks can jointly cover the cone, but not with a gap', () => {
    const covering: Obstacle[] = [
      { id: 'r1', x: 0, y: 0.45, radius: 0.5 },
      { id: 'r2', x: 0, y: -0.45, radius: 0.5 },
    ];
    expect(hasLinearShot(duel[0]!, duel[1]!, covering)).toBe(false);
    const gap: Obstacle[] = [
      { id: 'r1', x: 0, y: 1.5, radius: 0.5 },
      { id: 'r2', x: 0, y: -1.5, radius: 0.5 },
    ];
    expect(hasLinearShot(duel[0]!, duel[1]!, gap)).toBe(true);
  });

  it('findShotWitness finds a way around a rock and refuses impossible geometry', () => {
    const rock: Obstacle[] = [{ id: 'r', x: 0, y: 0, radius: 3 }];
    const bounds = { minX: -25, maxX: 25, minY: -15, maxY: 15 };
    const w = findShotWitness(duel[0]!, duel[1]!, duel, rock, bounds);
    expect(w).not.toBeNull();
    expect(w!.direction).toBe(1);
    expect(findShotWitness(duel[1]!, duel[0]!, duel, rock, bounds)!.direction).toBe(-1);

    // Vertically aligned players can never be connected by a function of x.
    const aligned = [
      { id: 'a', x: 0, y: -10 },
      { id: 'b', x: 0, y: 10 },
    ];
    expect(findShotWitness(aligned[0]!, aligned[1]!, aligned, [], bounds)).toBeNull();

    // A wall of rocks that fills the field leaves no route.
    const wall: Obstacle[] = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, x: 0, y: -14 + i * 2.6, radius: 1.6 }));
    expect(findShotWitness(duel[0]!, duel[1]!, duel, wall, bounds)).toBeNull();
  });
});
