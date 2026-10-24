import { findFirstCollision, obstacleTarget, soldierTarget, type CircleTarget } from './collision';
import { parseExpression } from './expressionParser';
import { getSoldier } from './gameState';
import { computeTrajectory, isUsableTrajectory } from './trajectory';
import { advanceRound, advanceTurn, validateShooter } from './turnManager';
import type { GameState, ShotDirection, ShotResult, Trajectory } from './types';

export type ShotAttempt = { ok: true; shot: ShotResult } | { ok: false; error: string };

/** Builds the unobstructed trajectory for a soldier; used for previews and for firing. */
export function buildTrajectory(
  state: GameState,
  soldierId: string,
  expression: string,
  direction: ShotDirection,
): { ok: true; trajectory: Trajectory } | { ok: false; error: string } {
  const soldier = getSoldier(state, soldierId);
  if (!soldier) return { ok: false, error: 'No shooter selected.' };

  const parsed = parseExpression(expression);
  if (!parsed.ok) return parsed;

  const result = computeTrajectory(
    parsed.evaluate,
    { x: soldier.x, y: soldier.y },
    direction,
    state.battlefield.bounds,
  );
  if (!result.ok) return result;

  if (!isUsableTrajectory(result.trajectory)) {
    return {
      ok: false,
      error: 'This function leaves the battlefield (or is undefined) immediately. Try a gentler curve or flip the direction.',
    };
  }
  return result;
}

/**
 * Pure simulation of one shot: finds the first collision along the trajectory.
 * Does not modify `state`; apply the result with `applyShot`.
 */
export function simulateShot(
  state: GameState,
  soldierId: string,
  expression: string,
  direction: ShotDirection,
  requireTurn = true,
): ShotAttempt {
  const shooterError = validateShooter(state, soldierId, requireTurn);
  if (shooterError) return { ok: false, error: shooterError };

  const built = buildTrajectory(state, soldierId, expression, direction);
  if (!built.ok) return built;
  const { trajectory } = built;

  // The shooter cannot hit themself; fallen soldiers no longer block shots.
  const targets: CircleTarget[] = [
    ...state.soldiers.filter((s) => s.alive && s.id !== soldierId).map(soldierTarget),
    ...state.battlefield.obstacles.map(obstacleTarget),
  ];

  const collision = findFirstCollision(trajectory.points, targets);
  if (!collision) {
    return {
      ok: true,
      shot: {
        shooterId: soldierId,
        expression,
        direction,
        points: trajectory.points,
        outcome: 'miss',
        targetId: null,
        impact: null,
        end: trajectory.end,
      },
    };
  }

  const points = [...trajectory.points.slice(0, collision.segmentIndex + 1), collision.point];
  return {
    ok: true,
    shot: {
      shooterId: soldierId,
      expression,
      direction,
      points,
      outcome: collision.target.kind === 'soldier' ? 'hit-soldier' : 'hit-obstacle',
      targetId: collision.target.id,
      impact: collision.point,
      end: trajectory.end,
    },
  };
}

/** Applies a completed shot: eliminates a hit player, then advances the turn. */
export function applyShot(state: GameState, shot: ShotResult): GameState {
  const soldiers =
    shot.outcome === 'hit-soldier'
      ? state.soldiers.map((s) => (s.id === shot.targetId ? { ...s, alive: false } : s))
      : state.soldiers;
  return advanceTurn({ ...state, soldiers });
}

export function pathLength(points: ShotResult['points']): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as { x: number; y: number };
    const b = points[i] as { x: number; y: number };
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/**
 * Ids of the soldiers eliminated by a simultaneous round. When two players hit each other, the one
 * whose function is shorter (up to the point of impact) wins the duel and survives; equal lengths
 * eliminate both.
 */
export function roundEliminations(shots: ShotResult[]): Set<string> {
  const hits = shots.filter((s) => s.outcome === 'hit-soldier' && s.targetId !== null);
  const eliminated = new Set<string>();
  for (const shot of hits) {
    const target = shot.targetId as string;
    const reply = hits.find((other) => other.shooterId === target && other.targetId === shot.shooterId);
    if (reply && pathLength(reply.points) < pathLength(shot.points)) continue;
    eliminated.add(target);
  }
  return eliminated;
}

/**
 * Applies all shots of one simultaneous round at once. Every shot was simulated against the same
 * state, so a player who is hit still gets their own shot off; eliminations happen together.
 */
export function applyRound(state: GameState, shots: ShotResult[]): GameState {
  const hit = roundEliminations(shots);
  const soldiers = state.soldiers.map((s) => (hit.has(s.id) ? { ...s, alive: false } : s));
  return advanceRound({ ...state, soldiers });
}
