import { PLAYER_COLORS, SOLDIER_RADIUS } from './constants';
import { generateMap } from './battlefieldGenerator';
import type { GameState, MatchConfig, Player, PlayerId, Soldier, ShotDirection } from './types';

export const DEFAULT_CONFIG: MatchConfig = { playerCount: 2, mapId: 'classic', seed: 1 };

export function createInitialState(config: MatchConfig = DEFAULT_CONFIG): GameState {
  const { positions, battlefield } = generateMap(config.mapId, config.playerCount, config.seed);
  const players: Player[] = positions.map((_, i) => ({
    id: i + 1,
    name: `Player ${i + 1}`,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length] as string,
  }));
  const soldiers: Soldier[] = positions.map((p, i) => ({
    id: `p${i + 1}`,
    playerId: i + 1,
    label: `${i + 1}`,
    x: p.x,
    y: p.y,
    radius: SOLDIER_RADIUS,
    alive: true,
  }));
  return {
    config,
    players,
    soldiers,
    battlefield,
    turn: { currentPlayerId: 1, turnNumber: 1, hasFired: false },
    status: 'playing',
    winnerId: null,
    shotStats: players.map((p) => ({ playerId: p.id, successfulShots: 0, accuracySum: 0 })),
  };
}

/** Restarting a match rebuilds the initial state from the same config (same map, same positions). */
export function restartGame(state: GameState): GameState {
  return createInitialState(state.config);
}

export function getPlayer(state: GameState, id: PlayerId): Player {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`Unknown player ${id}`);
  return player;
}

export function getSoldier(state: GameState, id: string | null): Soldier | undefined {
  return id === null ? undefined : state.soldiers.find((s) => s.id === id);
}

export function getPlayerSoldier(state: GameState, playerId: PlayerId): Soldier | undefined {
  return state.soldiers.find((s) => s.playerId === playerId);
}

export function getLivingSoldiers(state: GameState): Soldier[] {
  return state.soldiers.filter((s) => s.alive);
}

/** Initial shooting direction: towards the middle of the field. */
export function defaultDirection(soldier: Soldier): ShotDirection {
  return soldier.x <= 0 ? 1 : -1;
}
