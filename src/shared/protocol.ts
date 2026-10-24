import { COUNTDOWN_MAX_SECONDS, COUNTDOWN_MIN_SECONDS } from '../game/constants';
import type {
  GameOptions,
  GameState,
  MapId,
  PlayerId,
  ShotDirection,
  ShotMode,
  ShotResult,
  TrajectoryPoint,
} from '../game/types';

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
  /** 0 when the player has no selfie; otherwise a version number for the photo URL. */
  photoRev: number;
}

/** URL of a player's selfie (served by the host), or null when they have none. */
export function photoUrl(member: Pick<MemberView, 'playerId' | 'photoRev'>): string | null {
  return member.photoRev > 0 ? `/api/photo/${member.playerId}?v=${member.photoRev}` : null;
}

/** What a phone is currently typing, validated (and, if the preview option is on, previewed) by the server. */
export interface DraftView {
  playerId: PlayerId;
  /** Empty when the preview option is off, so the big screen does not reveal the function. */
  expression: string;
  direction: ShotDirection;
  points: TrajectoryPoint[] | null;
  error: string | null;
}

/** Time left, measured on the server when the view was sent; clients count down from their receive time. */
export interface TimerView {
  remainingMs: number;
  totalMs: number;
}

export interface FiredShot {
  playerId: PlayerId;
  shot: ShotResult;
  color: string;
}

export interface DisplayView {
  phase: Phase;
  mapId: MapId;
  seed: number;
  options: GameOptions;
  members: MemberView[];
  game: GameState | null;
  drafts: DraftView[];
  /** Simultaneous mode: players who already locked in their shot this round. */
  submitted: PlayerId[];
  timer: TimerView | null;
  notice: Notice | null;
  shotInFlight: boolean;
}

export interface PlayerView {
  phase: Phase;
  options: GameOptions;
  you: MemberView;
  playerCount: number;
  currentPlayerId: PlayerId | null;
  currentPlayerName: string | null;
  /** True when this phone may type and fire right now. */
  canAct: boolean;
  /** Simultaneous mode: this phone already fired in the current round. */
  submitted: boolean;
  firedCount: number;
  livingCount: number;
  turnNumber: number;
  /** Direction the phone should start the turn with (towards the middle of the field). */
  turnDirection: ShotDirection;
  shotInFlight: boolean;
  winnerId: PlayerId | null;
  /** Changes whenever a new match starts, so the phone can reset per-match settings (e.g. its x direction). */
  matchId: number;
  draftError: string | null;
  timer: TimerView | null;
  notice: Notice | null;
}

export type ClientMessage =
  | { type: 'hello'; role: 'display' }
  | { type: 'hello'; role: 'player'; token: string | null }
  | { type: 'configure'; mapId: MapId; seed: number; options: GameOptions }
  | { type: 'start' }
  | { type: 'restart' }
  | { type: 'lobby' }
  | { type: 'skipTurn' }
  | { type: 'shotDone'; id: number }
  | { type: 'draft'; expression: string; direction: ShotDirection }
  | { type: 'fire'; expression: string; direction: ShotDirection }
  /** Lobby only: set (JPEG data URL) or remove (null) the player's selfie. */
  | { type: 'photo'; image: string | null };

export type ServerMessage =
  | { type: 'welcome'; token: string }
  | { type: 'display'; view: DisplayView }
  | { type: 'player'; view: PlayerView }
  | { type: 'shots'; id: number; shots: FiredShot[] }
  | { type: 'rejected'; text: string };

export const MAX_MESSAGE_EXPRESSION = 500;
/** Selfies travel as base64 JPEG data URLs; this is the longest accepted string (about 22 KB of image). */
export const MAX_PHOTO_CHARS = 32_000;
const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

const MAP_IDS: MapId[] = ['classic', 'pillars', 'scatter'];
const SHOT_MODES: ShotMode[] = ['turns', 'simultaneous'];

function parseOptions(raw: unknown): GameOptions | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (
    !SHOT_MODES.includes(o.shotMode as ShotMode) ||
    typeof o.preview !== 'boolean' ||
    typeof o.countdownEnabled !== 'boolean' ||
    typeof o.countdownSeconds !== 'number' ||
    !Number.isInteger(o.countdownSeconds) ||
    o.countdownSeconds < COUNTDOWN_MIN_SECONDS ||
    o.countdownSeconds > COUNTDOWN_MAX_SECONDS
  ) {
    return null;
  }
  return {
    shotMode: o.shotMode as ShotMode,
    preview: o.preview,
    countdownEnabled: o.countdownEnabled,
    countdownSeconds: o.countdownSeconds,
  };
}

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
    case 'configure': {
      const options = parseOptions(m.options);
      if (options && MAP_IDS.includes(m.mapId as MapId) && typeof m.seed === 'number' && Number.isSafeInteger(m.seed)) {
        return { type: 'configure', mapId: m.mapId as MapId, seed: m.seed, options };
      }
      return null;
    }
    case 'start':
    case 'restart':
    case 'lobby':
    case 'skipTurn':
      return { type: m.type };
    case 'shotDone':
      return typeof m.id === 'number' ? { type: 'shotDone', id: m.id } : null;
    case 'photo':
      if (m.image === null) return { type: 'photo', image: null };
      return typeof m.image === 'string' && m.image.length <= MAX_PHOTO_CHARS && JPEG_DATA_URL.test(m.image)
        ? { type: 'photo', image: m.image }
        : null;
    case 'draft':
    case 'fire':
      return expression(m.expression) && direction(m.direction)
        ? { type: m.type, expression: m.expression, direction: m.direction }
        : null;
    default:
      return null;
  }
}
