import { describeTrajectoryEnd } from './trajectory';
import { getPlayer, getSoldier } from './gameState';
import type { GameState, ShotResult } from './types';

export interface ShotMessage {
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

/**
 * Human-readable summary of a shot. `state` is the state BEFORE the shot was applied.
 * In a simultaneous round, pass the round's `eliminated` ids so duels lost on length are reported.
 */
export function describeShot(state: GameState, shot: ShotResult, eliminated?: ReadonlySet<string>): ShotMessage {
  const shooter = getSoldier(state, shot.shooterId);
  const shooterName = shooter ? getPlayer(state, shooter.playerId).name : 'Player';
  if (shot.outcome === 'hit-soldier') {
    const target = getSoldier(state, shot.targetId);
    const targetName = target ? getPlayer(state, target.playerId).name : 'a player';
    if (eliminated && shot.targetId !== null && !eliminated.has(shot.targetId)) {
      return { kind: 'info', text: `${shooterName} hit ${targetName}, but ${targetName}'s shorter function won the duel.` };
    }
    return { kind: 'success', text: `${shooterName} eliminated ${targetName}!` };
  }
  if (shot.outcome === 'hit-obstacle') {
    return { kind: 'info', text: `${shooterName}'s shot was blocked by an obstacle.` };
  }
  return { kind: 'info', text: `${shooterName} missed — the shot ${describeTrajectoryEnd(shot.end)}.` };
}
