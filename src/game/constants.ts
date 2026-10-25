import type { Bounds, GameOptions } from './types';

export const BOUNDS: Bounds = { minX: -25, maxX: 25, minY: -15, maxY: 15 };

/** Distance between curve samples along the local x-axis. */
export const SAMPLE_STEP = 0.05;

/** A y-jump larger than this between two adjacent samples is treated as a discontinuity. */
export const MAX_JUMP_PER_STEP = 10;

export const SOLDIER_RADIUS = 0.8;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const MAX_EXPRESSION_LENGTH = 120;
export const MAX_EXPRESSION_NODES = 150;
export const DEFAULT_EXPRESSION = 'sin(x)';

export const COUNTDOWN_MIN_SECONDS = 5;
export const COUNTDOWN_MAX_SECONDS = 300;
export const PLAYER_MOVEMENT_MIN_DISTANCE = 0.1;
export const PLAYER_MOVEMENT_MAX_DISTANCE = 2;
export const PLAYER_MOVEMENT_STEP = 0.1;

export const DEFAULT_OPTIONS: GameOptions = {
  shotMode: 'simultaneous',
  preview: 'off',
  playerMovement: false,
  playerMovementDistance: 0.5,
  obstacleBehavior: 'static',
  countdownEnabled: true,
  countdownSeconds: 30,
};

export const PLAYER_COLORS = ['#a9d8e8', '#f2c6a8', '#c7ddb0', '#e8b8c2', '#e9d891', '#d1c1e5'] as const;
