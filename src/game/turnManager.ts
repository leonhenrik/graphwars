import { getLivingSoldiers, getPlayer, getPlayerSoldier } from './gameState';
import type { GameState, PlayerId } from './types';

/**
 * Returns an error message if `soldierId` may not shoot right now, otherwise null.
 * With `requireTurn = false` (simultaneous mode) any living soldier may shoot.
 */
export function validateShooter(state: GameState, soldierId: string | null, requireTurn = true): string | null {
  if (state.status === 'over') return 'The match is over. Start a new game.';
  if (requireTurn && state.turn.hasFired) return 'You already fired this turn.';
  const soldier = state.soldiers.find((s) => s.id === soldierId);
  if (!soldier) return 'No shooter selected.';
  if (!soldier.alive) return 'That player has been eliminated.';
  if (requireTurn && soldier.playerId !== state.turn.currentPlayerId) {
    return `It is not ${getPlayer(state, soldier.playerId).name}'s turn.`;
  }
  return null;
}

export function getActiveSoldierId(state: GameState): string | null {
  return getPlayerSoldier(state, state.turn.currentPlayerId)?.id ?? null;
}

export function getWinner(state: GameState): PlayerId | null {
  const living = getLivingSoldiers(state);
  return living.length === 1 ? (living[0] as { playerId: PlayerId }).playerId : null;
}

export function markFired(state: GameState): GameState {
  return { ...state, turn: { ...state.turn, hasFired: true } };
}

/** Next living player after `current`, wrapping around; skips eliminated players. */
export function nextLivingPlayer(state: GameState, current: PlayerId): PlayerId | null {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const candidate = state.players[(current - 1 + step) % n];
    if (candidate && state.soldiers.some((s) => s.playerId === candidate.id && s.alive)) return candidate.id;
  }
  return null;
}

/** Ends a simultaneous round: a winner exists once one (or zero, i.e. a draw) players are left. */
export function advanceRound(state: GameState): GameState {
  const living = getLivingSoldiers(state);
  if (living.length <= 1) {
    return { ...state, status: 'over', winnerId: getWinner(state), turn: { ...state.turn, hasFired: true } };
  }
  const first = living[0] as { playerId: PlayerId };
  return {
    ...state,
    turn: { currentPlayerId: first.playerId, turnNumber: state.turn.turnNumber + 1, hasFired: false },
  };
}

/** Ends the turn: checks for a winner (last player standing), otherwise hands control to the next living player. */
export function advanceTurn(state: GameState): GameState {
  const living = getLivingSoldiers(state).length;
  if (living <= 1) {
    return { ...state, status: 'over', winnerId: getWinner(state), turn: { ...state.turn, hasFired: true } };
  }
  const next = nextLivingPlayer(state, state.turn.currentPlayerId);
  if (next === null) return { ...state, status: 'over', winnerId: null };
  return {
    ...state,
    turn: { currentPlayerId: next, turnNumber: state.turn.turnNumber + 1, hasFired: false },
  };
}
