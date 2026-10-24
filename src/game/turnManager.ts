import { getLivingSoldiers, getSoldier, otherPlayer } from './gameState';
import type { GameState, PlayerId, Soldier } from './types';

/** Returns an error message if `soldierId` may not shoot right now, otherwise null. */
export function validateShooter(state: GameState, soldierId: string | null): string | null {
  if (state.status === 'over') return 'The match is over. Start a new game.';
  if (state.turn.hasFired) return 'You already fired this turn.';
  const soldier = getSoldier(state, soldierId);
  if (!soldier) return 'Select one of your soldiers first.';
  if (!soldier.alive) return 'That soldier has been eliminated.';
  if (soldier.playerId !== state.turn.currentPlayerId) {
    return `That soldier belongs to ${state.players[soldier.playerId].name}.`;
  }
  return null;
}

export function canSelectSoldier(state: GameState, soldier: Soldier): boolean {
  return state.status === 'playing' && soldier.alive && soldier.playerId === state.turn.currentPlayerId;
}

export function getWinner(state: GameState): PlayerId | null {
  const p1 = getLivingSoldiers(state, 1).length;
  const p2 = getLivingSoldiers(state, 2).length;
  if (p1 === 0 && p2 === 0) return null;
  if (p1 === 0) return 2;
  if (p2 === 0) return 1;
  return null;
}

export function markFired(state: GameState): GameState {
  return { ...state, turn: { ...state.turn, hasFired: true } };
}

/** Ends the turn: checks for a winner, otherwise hands control to the other player. */
export function advanceTurn(state: GameState): GameState {
  const living1 = getLivingSoldiers(state, 1).length;
  const living2 = getLivingSoldiers(state, 2).length;
  if (living1 === 0 || living2 === 0) {
    return { ...state, status: 'over', winnerId: getWinner(state), turn: { ...state.turn, hasFired: true } };
  }
  return {
    ...state,
    turn: {
      currentPlayerId: otherPlayer(state.turn.currentPlayerId),
      turnNumber: state.turn.turnNumber + 1,
      hasFired: false,
    },
  };
}
