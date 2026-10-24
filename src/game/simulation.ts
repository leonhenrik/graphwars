import { findFirstCollision, obstacleTarget, soldierTarget, type CircleTarget } from './collision';
import { parseExpression } from './expressionParser';
import { getSoldier } from './gameState';
import { computeTrajectory, isUsableTrajectory } from './trajectory';
import { advanceTurn, validateShooter } from './turnManager';
import type { GameState, ShotResult, Trajectory } from './types';

export type ShotAttempt = { ok: true; shot: ShotResult } | { ok: false; error: string };

/** Builds the unobstructed trajectory for a soldier; used for previews and for firing. */
export function buildTrajectory(
  state: GameState,
  soldierId: string,
  expression: string,
): { ok: true; trajectory: Trajectory } | { ok: false; error: string } {
  const soldier = getSoldier(state, soldierId);
  if (!soldier) return { ok: false, error: 'Select one of your soldiers first.' };

  const parsed = parseExpression(expression);
  if (!parsed.ok) return parsed;

  const result = computeTrajectory(
    parsed.evaluate,
    { x: soldier.x, y: soldier.y },
    state.players[soldier.playerId].direction,
    state.battlefield.bounds,
  );
  if (!result.ok) return result;

  if (!isUsableTrajectory(result.trajectory)) {
    return {
      ok: false,
      error: 'This function leaves the battlefield (or is undefined) immediately from this soldier. Try a gentler curve.',
    };
  }
  return result;
}

/**
 * Pure simulation of one shot: finds the first collision along the trajectory.
 * Does not modify `state`; apply the result with `applyShot`.
 */
export function simulateShot(state: GameState, soldierId: string, expression: string): ShotAttempt {
  const shooterError = validateShooter(state, soldierId);
  if (shooterError) return { ok: false, error: shooterError };

  const built = buildTrajectory(state, soldierId, expression);
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
      points,
      outcome: collision.target.kind === 'soldier' ? 'hit-soldier' : 'hit-obstacle',
      targetId: collision.target.id,
      impact: collision.point,
      end: trajectory.end,
    },
  };
}

/** Applies a completed shot: eliminates a hit soldier (friend or foe), then advances the turn. */
export function applyShot(state: GameState, shot: ShotResult): GameState {
  const soldiers =
    shot.outcome === 'hit-soldier'
      ? state.soldiers.map((s) => (s.id === shot.targetId ? { ...s, alive: false } : s))
      : state.soldiers;
  return advanceTurn({ ...state, soldiers });
}
