import type { GameState, MapId, PlayerId, ShotDirection, ShotResult, TrajectoryPoint } from '../game/types';

/** Messages exchanged over the WebSocket between the laptop (display), the phones (players) and the server. */

export type NoticeKind = 'info' | 'success' | 'warning' | 'error';
export interface Notice {
  kind: NoticeKind;
  text: string;
}

export type Phase = 'lobby' | 'playing' | 'over';

export interface MemberView {
  playerId: PlayerId;
  name: string;
  color: string;
  connected: boolean;
  alive: boolean;
}

/** What the active player's phone is currently typing, validated and previewed by the server. */
export interface DraftView {
  playerId: PlayerId;
  expression: string;
  direction: ShotDirection;
  points: TrajectoryPoint[] | null;
  error: string | null;
}

export interface DisplayView {
  phase: Phase;
  mapId: MapId;
  seed: number;
  members: MemberView[];
  game: GameState | null;
  draft: DraftView | null;
  notice: Notice | null;
  shotInFlight: boolean;
}

export interface PlayerView {
  phase: Phase;
  you: MemberView;
  playerCount: number;
  currentPlayerId: PlayerId | null;
  currentPlayerName: string | null;
  isMyTurn: boolean;
  turnNumber: number;
  /** Direction the phone should start the turn with (towards the middle of the field). */
  turnDirection: ShotDirection;
  shotInFlight: boolean;
  winnerId: PlayerId | null;
  draftError: string | null;
  notice: Notice | null;
}

export type ClientMessage =
  | { type: 'hello'; role: 'display' }
  | { type: 'hello'; role: 'player'; token: string | null }
  | { type: 'configure'; mapId: MapId; seed: number }
  | { type: 'start' }
  | { type: 'restart' }
  | { type: 'lobby' }
  | { type: 'skipTurn' }
  | { type: 'shotDone'; id: number }
  | { type: 'draft'; expression: string; direction: ShotDirection }
  | { type: 'fire'; expression: string; direction: ShotDirection };

export type ServerMessage =
  | { type: 'welcome'; token: string }
  | { type: 'display'; view: DisplayView }
  | { type: 'player'; view: PlayerView }
  | { type: 'shot'; id: number; shot: ShotResult; color: string }
  | { type: 'rejected'; text: string };

export const MAX_MESSAGE_EXPRESSION = 500;

const MAP_IDS: MapId[] = ['classic', 'pillars', 'scatter'];

/** Runtime validation of untrusted JSON from the network. Returns null for anything malformed. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const direction = (v: unknown): v is ShotDirection => v === 1 || v === -1;
  const expression = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_MESSAGE_EXPRESSION;

  switch (m.type) {
    case 'hello':
      if (m.role === 'display') return { type: 'hello', role: 'display' };
      if (m.role === 'player' && (m.token === null || (typeof m.token === 'string' && m.token.length <= 100))) {
        return { type: 'hello', role: 'player', token: m.token };
      }
      return null;
    case 'configure':
      if (MAP_IDS.includes(m.mapId as MapId) && typeof m.seed === 'number' && Number.isSafeInteger(m.seed)) {
        return { type: 'configure', mapId: m.mapId as MapId, seed: m.seed };
      }
      return null;
    case 'start':
    case 'restart':
    case 'lobby':
    case 'skipTurn':
      return { type: m.type };
    case 'shotDone':
      return typeof m.id === 'number' ? { type: 'shotDone', id: m.id } : null;
    case 'draft':
    case 'fire':
      return expression(m.expression) && direction(m.direction)
        ? { type: m.type, expression: m.expression, direction: m.direction }
        : null;
    default:
      return null;
  }
}
