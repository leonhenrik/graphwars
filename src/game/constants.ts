import type { Bounds } from './types';

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

export const PLAYER_COLORS = ['#38bdf8', '#fb923c', '#4ade80', '#f472b6', '#facc15', '#a78bfa'] as const;
