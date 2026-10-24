export type PlayerId = 1 | 2;

/** +1 = shots travel towards increasing x (right), -1 = towards decreasing x (left). */
export type ShotDirection = 1 | -1;

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  direction: ShotDirection;
}

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

export interface TurnState {
  currentPlayerId: PlayerId;
  turnNumber: number;
  /** True once the active player has committed their shot for this turn. */
  hasFired: boolean;
}

export type MatchStatus = 'playing' | 'over';

export interface GameState {
  players: Record<PlayerId, Player>;
  soldiers: Soldier[];
  battlefield: Battlefield;
  turn: TurnState;
  status: MatchStatus;
  winnerId: PlayerId | null;
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
  /** Path actually travelled, ending at the impact point (or the end of the trajectory for misses). */
  points: TrajectoryPoint[];
  outcome: ShotOutcome;
  targetId: string | null;
  impact: TrajectoryPoint | null;
  end: TrajectoryEnd;
}
