import { describe, expect, it } from 'vitest';
import { createInitialState, getLivingSoldiers, restartGame } from '../game/gameState';
import { applyShot, simulateShot } from '../game/simulation';
import { advanceTurn, markFired, validateShooter } from '../game/turnManager';
import type { GameState, Obstacle, Soldier } from '../game/types';

function soldier(id: string, playerId: 1 | 2, x: number, y: number, alive = true): Soldier {
  return { id, playerId, label: id, x, y, radius: 0.8, alive };
}

function makeState(soldiers: Soldier[], obstacles: Obstacle[] = []): GameState {
  const base = createInitialState();
  return { ...base, soldiers, battlefield: { ...base.battlefield, obstacles } };
}

function shoot(state: GameState, id: string, expr: string) {
  const r = simulateShot(state, id, expr);
  if (!r.ok) throw new Error(r.error);
  return r.shot;
}

const alive = (s: GameState, id: string) => s.soldiers.find((x) => x.id === id)!.alive;

describe('simulation – hits', () => {
  it('eliminates an enemy that is hit', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('e', 2, 10, 0), soldier('e2', 2, 10, 12)]);
    const shot = shoot(s, 'a', '0');
    expect(shot.outcome).toBe('hit-soldier');
    expect(shot.targetId).toBe('e');
    const next = applyShot(s, shot);
    expect(alive(next, 'e')).toBe(false);
    expect(alive(next, 'e2')).toBe(true);
    expect(alive(next, 'a')).toBe(true);
  });

  it('applies friendly fire', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('f', 1, 0, 0), soldier('e', 2, 15, 0)]);
    const shot = shoot(s, 'a', '0');
    expect(shot.targetId).toBe('f');
    const next = applyShot(s, shot);
    expect(alive(next, 'f')).toBe(false);
    expect(alive(next, 'e')).toBe(true);
  });

  it('stops at an obstacle without eliminating anyone', () => {
    const s = makeState(
      [soldier('a', 1, -10, 0), soldier('e', 2, 10, 0)],
      [{ id: 'rock', x: 0, y: 0, radius: 2 }],
    );
    const shot = shoot(s, 'a', '0');
    expect(shot.outcome).toBe('hit-obstacle');
    expect(shot.targetId).toBe('rock');
    expect(shot.impact!.x).toBeCloseTo(-2, 1);
    expect(shot.points[shot.points.length - 1]).toEqual(shot.impact);
    const next = applyShot(s, shot);
    expect(next.soldiers.every((x) => x.alive)).toBe(true);
  });

  it('resolves the first collision when several targets lie on the path', () => {
    const s = makeState(
      [soldier('a', 1, -20, 0), soldier('near', 2, -5, 0), soldier('far', 2, 15, 0)],
      [{ id: 'rock', x: 5, y: 0, radius: 2 }],
    );
    const shot = shoot(s, 'a', '0');
    expect(shot.targetId).toBe('near');
    const next = applyShot(s, shot);
    expect(alive(next, 'near')).toBe(false);
    expect(alive(next, 'far')).toBe(true);
  });

  it('lets an obstacle shield a soldier behind it', () => {
    const s = makeState(
      [soldier('a', 1, -20, 0), soldier('far', 2, 15, 0)],
      [{ id: 'rock', x: -5, y: 0, radius: 2 }],
    );
    expect(shoot(s, 'a', '0').targetId).toBe('rock');
  });

  it('ignores eliminated soldiers and the shooter itself', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('dead', 2, 0, 0, false), soldier('e', 2, 10, 0)]);
    expect(shoot(s, 'a', '0').targetId).toBe('e');
  });

  it('shoots leftwards for player 2', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('e', 2, 10, 0)]);
    const turn2 = advanceTurn(s);
    const shot = shoot(turn2, 'e', '0');
    expect(shot.targetId).toBe('a');
  });

  it('a missed shot eliminates nobody', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('e', 2, 10, 8)]);
    const shot = shoot(s, 'a', '0');
    expect(shot.outcome).toBe('miss');
    expect(shot.targetId).toBeNull();
    const next = applyShot(s, shot);
    expect(next.soldiers.every((x) => x.alive)).toBe(true);
    expect(next.turn.currentPlayerId).toBe(2);
  });

  it('is deterministic', () => {
    const s = createInitialState();
    expect(simulateShot(s, 'p1-s1', 'sin(x)')).toEqual(simulateShot(s, 'p1-s1', 'sin(x)'));
  });

  it('does not mutate the input state', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('e', 2, 10, 0)]);
    const copy = structuredClone(s);
    applyShot(s, shoot(s, 'a', '0'));
    expect(s).toEqual(copy);
  });
});

describe('simulation – bad input never crashes', () => {
  const s = createInitialState();
  it.each(['', 'sin(', '1/0', '1/x', 'sqrt(x)', 'log(x)', 'tan(x)', 'x^1000', 'exp(x*100)', '(-8)^(1/3)', 'foo', 'x=1'])(
    '%j',
    (expr) => {
      const a = simulateShot(s, 'p1-s1', expr);
      const b = simulateShot(s, 'p2-s1' as string, expr);
      for (const r of [a, b]) {
        if (r.ok) expect(r.shot.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
        else expect(typeof r.error).toBe('string');
      }
    },
  );

  it('explains functions that cannot produce a trajectory', () => {
    const r = simulateShot(s, 'p1-s1', 'x^1000');
    expect(r.ok).toBe(false);
  });

  it('partial trajectories still resolve (stops at the undefined point)', () => {
    const state = makeState([soldier('a', 1, -10, 0), soldier('e', 2, 10, 0)]);
    const r = simulateShot(state, 'a', 'sqrt(5 - x)');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shot.outcome).toBe('miss');
      expect(r.shot.end).toBe('undefined-value');
    }
  });
});

describe('turns', () => {
  it('prevents eliminated soldiers, enemy soldiers, and double fire', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('dead', 1, -12, 5, false), soldier('e', 2, 10, 0)]);
    expect(validateShooter(s, 'a')).toBeNull();
    expect(validateShooter(s, 'dead')).toMatch(/eliminated/);
    expect(validateShooter(s, 'e')).toMatch(/belongs to/);
    expect(validateShooter(s, null)).toMatch(/Select/);
    expect(validateShooter(s, 'nope')).toMatch(/Select/);
    expect(validateShooter(markFired(s), 'a')).toMatch(/already fired/);
    expect(simulateShot(s, 'dead', '0').ok).toBe(false);
  });

  it('alternates between players', () => {
    let s = createInitialState();
    expect(s.turn.currentPlayerId).toBe(1);
    s = advanceTurn(s);
    expect(s.turn).toMatchObject({ currentPlayerId: 2, turnNumber: 2, hasFired: false });
    s = advanceTurn(s);
    expect(s.turn).toMatchObject({ currentPlayerId: 1, turnNumber: 3 });
  });

  it('ends the match when a team has no living soldiers', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('e', 2, 10, 0)]);
    const next = applyShot(s, shoot(s, 'a', '0'));
    expect(next.status).toBe('over');
    expect(next.winnerId).toBe(1);
    expect(getLivingSoldiers(next, 2)).toHaveLength(0);
    expect(validateShooter(next, 'a')).toMatch(/over/);
  });

  it('friendly fire does not end the match while the shooter survives', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 1, 0, 0), soldier('e', 2, 10, 5)]);
    const next = applyShot(s, shoot(s, 'a', '0'));
    expect(alive(next, 'b')).toBe(false);
    expect(next.status).toBe('playing');
    expect(next.winnerId).toBeNull();
  });
});

describe('restart', () => {
  it('restores the initial state exactly', () => {
    let s = createInitialState();
    const initial = structuredClone(s);
    const shot = shoot(s, 'p1-s1', 'sin(x)');
    s = applyShot(markFired(s), shot);
    s = advanceTurn(s);
    expect(s).not.toEqual(initial);
    expect(restartGame()).toEqual(initial);
  });

  it('default layout is deterministic with 3 soldiers per team', () => {
    const s = createInitialState();
    expect(getLivingSoldiers(s, 1)).toHaveLength(3);
    expect(getLivingSoldiers(s, 2)).toHaveLength(3);
    expect(s.battlefield.obstacles.length).toBeGreaterThan(0);
    expect(createInitialState()).toEqual(s);
  });
});
