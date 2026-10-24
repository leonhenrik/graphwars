import { findFirstCollision, obstacleTarget, soldierTarget, type CircleTarget } from './collision';
import { parseExpression } from './expressionParser';
import { getSoldier } from './gameState';
import { computeTrajectory, extendBounds, isUsableTrajectory } from './trajectory';
import { advanceRound, advanceTurn, validateShooter } from './turnManager';
import type { Bounds, GameState, ShotDirection, ShotResult, Trajectory } from './types';

export type ShotAttempt = { ok: true; shot: ShotResult } | { ok: false; error: string };

/**
 * Builds the unobstructed trajectory for a soldier; used for previews and for firing.
 * `bounds` defaults to the battlefield; pass `extendBounds(...)` to also get the greyed-out continuation.
 */
export function buildTrajectory(
  state: GameState,
  soldierId: string,
  expression: string,
  direction: ShotDirection,
  bounds: Bounds = state.battlefield.bounds,
): { ok: true; trajectory: Trajectory } | { ok: false; error: string } {
  const soldier = getSoldier(state, soldierId);
  if (!soldier) return { ok: false, error: 'No shooter selected.' };

  const parsed = parseExpression(expression);
  if (!parsed.ok) return parsed;

  const result = computeTrajectory(parsed.evaluate, { x: soldier.x, y: soldier.y }, direction, bounds);
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
    const extended = buildTrajectory(state, soldierId, expression, direction, extendBounds(state.battlefield.bounds));
    return {
      ok: true,
      shot: {
        shooterId: soldierId,
        expression,
        direction,
        points: trajectory.points,
        extendedPoints: extended.ok ? extended.trajectory.points : trajectory.points,
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
      extendedPoints: points,
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

/**
 * Applies all shots of one simultaneous round at once. Every shot was simulated against the same
 * state, so a player who is hit still gets their own shot off; eliminations happen together.
 */
export function applyRound(state: GameState, shots: ShotResult[]): GameState {
  const hit = new Set(shots.filter((s) => s.outcome === 'hit-soldier').map((s) => s.targetId));
  const soldiers = state.soldiers.map((s) => (hit.has(s.id) ? { ...s, alive: false } : s));
  return advanceRound({ ...state, soldiers });
}
