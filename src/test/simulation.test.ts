import { describe, expect, it } from 'vitest';
import { createInitialState, defaultDirection, restartGame } from '../game/gameState';
import { applyRound, applyShot, simulateShot } from '../game/simulation';
import { advanceTurn, getActiveSoldierId, markFired, validateShooter } from '../game/turnManager';
import type { GameState, Obstacle, Soldier } from '../game/types';

function soldier(id: string, playerId: number, x: number, y: number, alive = true): Soldier {
  return { id, playerId, label: id, x, y, radius: 0.8, alive };
}

/** Player n owns soldier ids[n-1]. */
function makeState(soldiers: Soldier[], obstacles: Obstacle[] = []): GameState {
  const base = createInitialState({ playerCount: soldiers.length, mapId: 'classic', seed: 1 });
  return { ...base, soldiers, battlefield: { ...base.battlefield, obstacles } };
}

function shoot(state: GameState, id: string, expr: string, dir: 1 | -1 = 1) {
  const r = simulateShot(state, id, expr, dir);
  if (!r.ok) throw new Error(r.error);
  return r.shot;
}

const alive = (s: GameState, id: string) => s.soldiers.find((x) => x.id === id)!.alive;

describe('simulation – hits', () => {
  it('eliminates the player that is hit', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0), soldier('c', 3, 10, 12)]);
    const shot = shoot(s, 'a', '0');
    expect(shot.outcome).toBe('hit-soldier');
    expect(shot.targetId).toBe('b');
    const next = applyShot(s, shot);
    expect(alive(next, 'b')).toBe(false);
    expect(alive(next, 'c')).toBe(true);
    expect(alive(next, 'a')).toBe(true);
    const stat = next.shotStats.find((x) => x.playerId === 1)!;
    expect(stat.successfulShots).toBe(1);
    expect(stat.accuracySum).toBe(shot.accuracy);
  });

  it('does not count obstacle hits as successful shots', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0)], [{ id: 'rock', x: 0, y: 0, radius: 2 }]);
    const next = applyShot(s, shoot(s, 'a', '0'));
    expect(next.shotStats.every((x) => x.successfulShots === 0)).toBe(true);
  });

  it('stops at an obstacle without eliminating anyone', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0)], [{ id: 'rock', x: 0, y: 0, radius: 2 }]);
    const shot = shoot(s, 'a', '0');
    expect(shot.outcome).toBe('hit-obstacle');
    expect(shot.targetId).toBe('rock');
    expect(shot.impact!.x).toBeCloseTo(-2, 1);
    expect(shot.points[shot.points.length - 1]).toEqual(shot.impact);
    expect(applyShot(s, shot).soldiers.every((x) => x.alive)).toBe(true);
  });

  it('resolves the first collision when several targets lie on the path', () => {
    const s = makeState(
      [soldier('a', 1, -20, 0), soldier('near', 2, -5, 0), soldier('far', 3, 15, 0)],
      [{ id: 'rock', x: 5, y: 0, radius: 2 }],
    );
    const shot = shoot(s, 'a', '0');
    expect(shot.targetId).toBe('near');
    const next = applyShot(s, shot);
    expect(alive(next, 'near')).toBe(false);
    expect(alive(next, 'far')).toBe(true);
  });

  it('lets an obstacle shield a player behind it', () => {
    const s = makeState([soldier('a', 1, -20, 0), soldier('far', 2, 15, 0)], [{ id: 'rock', x: -5, y: 0, radius: 2 }]);
    expect(shoot(s, 'a', '0').targetId).toBe('rock');
  });

  it('ignores eliminated players and the shooter itself', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('dead', 2, 0, 0, false), soldier('e', 3, 10, 0)]);
    expect(shoot(s, 'a', '0').targetId).toBe('e');
  });

  it('shoots leftwards when the direction is flipped', () => {
    const s = advanceTurn(makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0)]));
    expect(shoot(s, 'b', '0', -1).targetId).toBe('a');
    // Facing right from b there is nothing but the wall.
    expect(shoot(s, 'b', '0', 1).outcome).toBe('miss');
  });

  it('flipping the direction mirrors the function', () => {
    // f = x/4 rises along the direction of travel: going left, the curve rises to the left.
    const s = makeState([soldier('a', 1, 0, 0)]);
    const right = shoot(s, 'a', 'x/4', 1);
    const left = shoot(s, 'a', 'x/4', -1);
    const lastR = right.points[right.points.length - 1]!;
    const lastL = left.points[left.points.length - 1]!;
    expect(lastR.x).toBeGreaterThan(0);
    expect(lastL.x).toBeLessThan(0);
    expect(lastR.y).toBeGreaterThan(0);
    expect(lastL.y).toBeGreaterThan(0);
  });

  it('a missed shot eliminates nobody', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 8)]);
    const shot = shoot(s, 'a', '0');
    expect(shot.outcome).toBe('miss');
    expect(shot.targetId).toBeNull();
    const next = applyShot(s, shot);
    expect(next.soldiers.every((x) => x.alive)).toBe(true);
    expect(next.turn.currentPlayerId).toBe(2);
  });

  it('is deterministic', () => {
    const s = createInitialState();
    expect(simulateShot(s, 'p1', 'sin(x)', 1)).toEqual(simulateShot(s, 'p1', 'sin(x)', 1));
  });

  it('does not mutate the input state', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0)]);
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
      for (const dir of [1, -1] as const) {
        const r = simulateShot(s, 'p1', expr, dir);
        if (r.ok) expect(r.shot.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
        else expect(typeof r.error).toBe('string');
      }
    },
  );

  it('explains functions that cannot produce a trajectory', () => {
    expect(simulateShot(s, 'p1', '1000*x', 1).ok).toBe(false);
  });

  it('partial trajectories still resolve (stops at the undefined point)', () => {
    const state = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 8)]);
    const r = simulateShot(state, 'a', 'sqrt(5 - x)', 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shot.outcome).toBe('miss');
      expect(r.shot.end).toBe('undefined-value');
    }
  });
});

describe('turns', () => {
  it('prevents eliminated players, other players, and double fire', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('dead', 2, -12, 5, false), soldier('e', 3, 10, 0)]);
    expect(validateShooter(s, 'a')).toBeNull();
    expect(validateShooter(s, 'dead')).toMatch(/eliminated/);
    expect(validateShooter(s, 'e')).toMatch(/not Player 3's turn/);
    expect(validateShooter(s, null)).toMatch(/No shooter/);
    expect(validateShooter(s, 'nope')).toMatch(/No shooter/);
    expect(validateShooter(markFired(s), 'a')).toMatch(/already fired/);
    expect(simulateShot(s, 'dead', '0', 1).ok).toBe(false);
  });

  it('rotates through all players in order', () => {
    let s = createInitialState({ playerCount: 3, mapId: 'classic', seed: 1 });
    const order: number[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(s.turn.currentPlayerId);
      s = advanceTurn(s);
    }
    expect(order).toEqual([1, 2, 3, 1, 2, 3]);
    expect(s.turn.turnNumber).toBe(7);
  });

  it('skips eliminated players', () => {
    let s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 0, 5, false), soldier('c', 3, 10, 0)]);
    s = advanceTurn(s);
    expect(s.turn.currentPlayerId).toBe(3);
    s = advanceTurn(s);
    expect(s.turn.currentPlayerId).toBe(1);
    expect(getActiveSoldierId(s)).toBe('a');
  });

  it('keeps playing until only one player is left, then declares them the winner', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0), soldier('c', 3, 10, 12)]);
    const afterFirst = applyShot(s, shoot(s, 'a', '0'));
    expect(afterFirst.status).toBe('playing');
    expect(afterFirst.winnerId).toBeNull();
    expect(afterFirst.turn.currentPlayerId).toBe(3); // player 2 is out

    const final = applyShot(afterFirst, shoot(afterFirst, 'c', '-0.6*x', -1));
    expect(alive(final, 'a')).toBe(false);
    expect(final.status).toBe('over');
    expect(final.winnerId).toBe(3);

    const duel = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0)]);
    const over = applyShot(duel, shoot(duel, 'a', '0'));
    expect(over.status).toBe('over');
    expect(over.winnerId).toBe(1);
    expect(validateShooter(over, 'a')).toMatch(/over/);
  });

  it('defaults the direction towards the middle of the field', () => {
    expect(defaultDirection(soldier('l', 1, -10, 0))).toBe(1);
    expect(defaultDirection(soldier('r', 2, 10, 0))).toBe(-1);
  });
});

describe('simultaneous rounds', () => {
  const trio = () => makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0), soldier('c', 3, 10, 12)]);

  it('any living soldier may shoot when the turn order is not required', () => {
    const s = trio();
    expect(validateShooter(s, 'b')).toMatch(/not Player 2's turn/);
    expect(validateShooter(s, 'b', false)).toBeNull();
    expect(validateShooter(markFired(s), 'b', false)).toBeNull();
    expect(validateShooter(makeState([soldier('a', 1, 0, 0, false), soldier('b', 2, 5, 0)]), 'a', false)).toMatch(/eliminated/);
    expect(simulateShot(s, 'b', '0', -1, false).ok).toBe(true);
    expect(simulateShot(s, 'b', '0', -1).ok).toBe(false);
  });

  it('applies all eliminations together: a player that is hit still shoots', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0), soldier('c', 3, 0, 12)]);
    const shotA = simulateShot(s, 'a', '0', 1, false);
    const shotB = simulateShot(s, 'b', '0', -1, false);
    if (!shotA.ok || !shotB.ok) throw new Error('shots must be valid');
    expect(shotA.shot.targetId).toBe('b');
    expect(shotB.shot.targetId).toBe('a');

    const next = applyRound(s, [shotA.shot, shotB.shot]);
    expect(next.soldiers.map((x) => x.alive)).toEqual([false, false, true]);
    expect(next.status).toBe('over');
    expect(next.winnerId).toBe(3);
  });

  it('continues with a new round while two or more players are left', () => {
    const s = trio();
    const miss = simulateShot(s, 'c', '0', 1, false);
    if (!miss.ok) throw new Error('unexpected');
    const next = applyRound(s, [miss.shot]);
    expect(next.status).toBe('playing');
    expect(next.turn.turnNumber).toBe(2);
    expect(next.soldiers.every((x) => x.alive)).toBe(true);
    expect(applyRound(s, []).turn.turnNumber).toBe(2);
  });

  it('a round in which everybody dies is a draw', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0)]);
    const shotA = simulateShot(s, 'a', '0', 1, false);
    const shotB = simulateShot(s, 'b', '0', -1, false);
    if (!shotA.ok || !shotB.ok) throw new Error('shots must be valid');
    const next = applyRound(s, [shotA.shot, shotB.shot]);
    expect(next.status).toBe('over');
    expect(next.winnerId).toBeNull();
  });

  it('the player with the shorter function wins a mutual hit', () => {
    const s = makeState([soldier('a', 1, -10, 0), soldier('b', 2, 10, 0)]);
    const straight = simulateShot(s, 'a', '0', 1, false);
    const detour = simulateShot(s, 'b', '0.02*x*(x-20)', -1, false);
    if (!straight.ok || !detour.ok) throw new Error('shots must be valid');
    expect(straight.shot.targetId).toBe('b');
    expect(detour.shot.targetId).toBe('a');

    const next = applyRound(s, [straight.shot, detour.shot]);
    expect(next.soldiers.map((x) => x.alive)).toEqual([true, false]);
    expect(next.winnerId).toBe(1);
  });

  it('does not mutate the input state', () => {
    const s = trio();
    const copy = structuredClone(s);
    const a = simulateShot(s, 'a', '0', 1, false);
    if (a.ok) applyRound(s, [a.shot]);
    expect(s).toEqual(copy);
  });
});

describe('restart', () => {
  it('restores the initial state exactly', () => {
    let s = createInitialState({ playerCount: 3, mapId: 'pillars', seed: 7 });
    const initial = structuredClone(s);
    const shot = shoot(s, 'p1', 'sin(x)', defaultDirection(s.soldiers[0]!));
    s = applyShot(markFired(s), shot);
    s = advanceTurn(s);
    expect(s).not.toEqual(initial);
    expect(restartGame(s)).toEqual(initial);
  });
});
