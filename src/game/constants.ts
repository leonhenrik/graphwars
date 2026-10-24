import type { Bounds, GameOptions } from './types';

export const BOUNDS: Bounds = { minX: -25, maxX: 25, minY: -15, maxY: 15 };

/**
 * The drawn area extends this far beyond the battlefield on each side (same 5:3 aspect as the field).
 * Curves keep going there, greyed out, but nothing in that margin takes part in the game.
 */
export const VIEW_MARGIN_X = 7.5;
export const VIEW_MARGIN_Y = 4.5;

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

export const DEFAULT_OPTIONS: GameOptions = {
  shotMode: 'turns',
  preview: true,
  countdownEnabled: false,
  countdownSeconds: 30,
};

export const PLAYER_COLORS = ['#38bdf8', '#fb923c', '#4ade80', '#f472b6', '#facc15', '#a78bfa'] as const;
