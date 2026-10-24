import { PLAYER_COLORS } from './constants';
import { createDefaultBattlefield, createDefaultSoldiers } from './battlefieldGenerator';
import type { GameState, PlayerId, Soldier } from './types';

export function createInitialState(): GameState {
  return {
    players: {
      1: { id: 1, name: 'Player 1', color: PLAYER_COLORS[1], direction: 1 },
      2: { id: 2, name: 'Player 2', color: PLAYER_COLORS[2], direction: -1 },
    },
    soldiers: createDefaultSoldiers(),
    battlefield: createDefaultBattlefield(),
    turn: { currentPlayerId: 1, turnNumber: 1, hasFired: false },
    status: 'playing',
    winnerId: null,
  };
}

/** Restarting a match simply builds a fresh initial state. */
export const restartGame = createInitialState;

export function getSoldier(state: GameState, id: string | null): Soldier | undefined {
  return id === null ? undefined : state.soldiers.find((s) => s.id === id);
}

export function getLivingSoldiers(state: GameState, playerId: PlayerId): Soldier[] {
  return state.soldiers.filter((s) => s.playerId === playerId && s.alive);
}

export function otherPlayer(id: PlayerId): PlayerId {
  return id === 1 ? 2 : 1;
}
