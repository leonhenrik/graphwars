export type PlayerId = number;

/** +1 = shots travel towards increasing world x (right), -1 = towards decreasing world x (left). */
export type ShotDirection = 1 | -1;

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
}

/** Every player controls exactly one soldier ("blob"). */
export interface Soldier {
  id: string;
  playerId: PlayerId;
  label: string;
  x: number;
  y: number;
  radius: number;
  alive: boolean;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Battlefield {
  bounds: Bounds;
  obstacles: Obstacle[];
}

export type MapId = 'classic' | 'pillars' | 'scatter' | 'chaos';

export interface MatchConfig {
  playerCount: number;
  mapId: MapId;
  /** Drives map generation; the same config always produces the same battlefield. */
  seed: number;
}

export interface TurnState {
  currentPlayerId: PlayerId;
  turnNumber: number;
  /** True once the active player has committed their shot for this turn. */
  hasFired: boolean;
}

export type MatchStatus = 'playing' | 'over';

/** 'turns': one player at a time. 'simultaneous': everybody enters a function, all shots resolve together. */
export type ShotMode = 'turns' | 'simultaneous';

export interface GameOptions {
  shotMode: ShotMode;
  /** Show the entered curve on the big screen while a player types. */
  preview: boolean;
  /** Move living players a small clockwise step after each completed round. */
  playerMovement: boolean;
  countdownEnabled: boolean;
  countdownSeconds: number;
}

export interface GameState {
  config: MatchConfig;
  players: Player[];
  soldiers: Soldier[];
  battlefield: Battlefield;
  turn: TurnState;
  status: MatchStatus;
  winnerId: PlayerId | null;
  /** One entry per player: successful (hitting a player) shots and the sum of their accuracy percentages. */
  shotStats: PlayerShotStats[];
}

export interface PlayerShotStats {
  playerId: PlayerId;
  successfulShots: number;
  accuracySum: number;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
}

export type TrajectoryEnd =
  | 'boundary' // reached the left/right edge of the battlefield
  | 'out-of-bounds' // curve left the battlefield vertically
  | 'undefined-value' // function was undefined / non-finite
  | 'discontinuity'; // curve jumped too far between two samples

export interface Trajectory {
  points: TrajectoryPoint[];
  end: TrajectoryEnd;
}

export type ShotOutcome = 'hit-soldier' | 'hit-obstacle' | 'miss';

export interface ShotResult {
  shooterId: string;
  expression: string;
  direction: ShotDirection;
  /** Path actually travelled, ending at the impact point (or the end of the trajectory for misses). */
  points: TrajectoryPoint[];
  outcome: ShotOutcome;
  targetId: string | null;
  impact: TrajectoryPoint | null;
  /** On a hit: 0-100, how close the shot came to the ideal (shortest obstacle-avoiding) path. */
  accuracy: number | null;
  end: TrajectoryEnd;
}
