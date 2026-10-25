import { findFirstCollision, obstacleTarget, soldierTarget, type CircleTarget } from './collision';
import { getSoldier } from './gameState';
import { parseExpression } from './expressionParser';
import { computeTrajectory, isUsableTrajectory } from './trajectory';
import { shotAccuracy } from './shotScore';
import { advanceRound, advanceTurn, validateShooter } from './turnManager';
import type { GameState, Obstacle, ObstacleBehavior, PlayerShotStats, ShotDirection, ShotResult, Trajectory } from './types';

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
        accuracy: null,
        end: trajectory.end,
      },
    };
  }

  const points = [...trajectory.points.slice(0, collision.segmentIndex + 1), collision.point];
  const shooter = state.soldiers.find((s) => s.id === soldierId);
  const hitSoldier = collision.target.kind === 'soldier' ? state.soldiers.find((s) => s.id === collision.target.id) : undefined;
  const accuracy =
    shooter && hitSoldier ? shotAccuracy(state.battlefield, shooter, hitSoldier, points, collision.point) : null;
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
      accuracy,
      end: trajectory.end,
    },
  };
}

/** Applies a completed shot: eliminates a hit player, records the shot's stats, then advances the turn. */
export function applyShot(state: GameState, shot: ShotResult, obstacleBehavior: ObstacleBehavior = 'static'): GameState {
  const soldiers =
    shot.outcome === 'hit-soldier'
      ? state.soldiers.map((s) => (s.id === shot.targetId ? { ...s, alive: false } : s))
      : state.soldiers;
  const battlefield = applyObstacleHits(state, [shot], obstacleBehavior);
  return advanceTurn({ ...state, soldiers, battlefield, shotStats: recordShotStats(state, [shot]) });
}

/** Adds each successful shot (one that hit another player) to its shooter's running totals. */
export function recordShotStats(state: GameState, shots: ShotResult[]): PlayerShotStats[] {
  const stats = state.shotStats.map((s) => ({ ...s }));
  for (const shot of shots) {
    if (shot.outcome !== 'hit-soldier' || shot.accuracy === null) continue;
    const shooter = getSoldier(state, shot.shooterId);
    const entry = stats.find((s) => s.playerId === shooter?.playerId);
    if (!entry) continue;
    entry.successfulShots += 1;
    entry.accuracySum += shot.accuracy;
  }
  return stats;
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
export function applyRound(state: GameState, shots: ShotResult[], obstacleBehavior: ObstacleBehavior = 'static'): GameState {
  const hit = roundEliminations(shots);
  const soldiers = state.soldiers.map((s) => (hit.has(s.id) ? { ...s, alive: false } : s));
  const battlefield = applyObstacleHits(state, shots, obstacleBehavior);
  return advanceRound({ ...state, soldiers, battlefield, shotStats: recordShotStats(state, shots) });
}

const DESTROYABLE_OBSTACLE_HITS = 2;
const MOVABLE_OBSTACLE_STEP = 0.8;

function applyObstacleHits(state: GameState, shots: ShotResult[], behavior: ObstacleBehavior): GameState['battlefield'] {
  if (behavior === 'static') return state.battlefield;
  const obstacles = state.battlefield.obstacles.map((obstacle) => ({ ...obstacle }));
  for (const shot of shots) {
    if (shot.outcome !== 'hit-obstacle' || !shot.targetId || !shot.impact) continue;
    const index = obstacles.findIndex((obstacle) => obstacle.id === shot.targetId);
    if (index < 0) continue;
    const obstacle = obstacles[index] as Obstacle;
    if (behavior === 'destroyable') {
      const damage = (obstacle.damage ?? 0) + 1;
      if (damage >= DESTROYABLE_OBSTACLE_HITS) obstacles.splice(index, 1);
      else obstacles[index] = { ...obstacle, damage };
      continue;
    }

    const dx = obstacle.x - shot.impact.x;
    const dy = obstacle.y - shot.impact.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const step = MOVABLE_OBSTACLE_STEP;
    const factors = [1, 0.5, 0.25];
    for (const factor of factors) {
      const x = Math.max(
        state.battlefield.bounds.minX + obstacle.radius,
        Math.min(state.battlefield.bounds.maxX - obstacle.radius, obstacle.x + (dx / length) * step * factor),
      );
      const y = Math.max(
        state.battlefield.bounds.minY + obstacle.radius,
        Math.min(state.battlefield.bounds.maxY - obstacle.radius, obstacle.y + (dy / length) * step * factor),
      );
      const clearOfSoldiers = state.soldiers.every(
        (soldier) => !soldier.alive || Math.hypot(soldier.x - x, soldier.y - y) >= soldier.radius + obstacle.radius + 0.08,
      );
      const clearOfObstacles = obstacles.every(
        (other, otherIndex) =>
          otherIndex === index || Math.hypot(other.x - x, other.y - y) >= other.radius + obstacle.radius + 0.08,
      );
      if (clearOfSoldiers && clearOfObstacles) {
        obstacles[index] = { ...obstacle, x, y };
        break;
      }
    }
  }
  return { ...state.battlefield, obstacles };
}
