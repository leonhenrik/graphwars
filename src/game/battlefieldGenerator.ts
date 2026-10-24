import { BOUNDS, SOLDIER_RADIUS } from './constants';
import type { Battlefield, Obstacle, PlayerId, Soldier } from './types';

/** Deterministic default layout: three soldiers per side, three fixed obstacles. */
export function createDefaultBattlefield(): Battlefield {
  const obstacles: Obstacle[] = [
    { id: 'obstacle-1', x: 0, y: 0, radius: 3 },
    { id: 'obstacle-2', x: -8, y: 9, radius: 1.8 },
    { id: 'obstacle-3', x: 8, y: -9, radius: 1.8 },
  ];
  return { bounds: { ...BOUNDS }, obstacles };
}

const LEFT_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [-21, 8],
  [-17, -1],
  [-21, -10],
];

export function createDefaultSoldiers(): Soldier[] {
  const make = (playerId: PlayerId, sign: 1 | -1): Soldier[] =>
    LEFT_POSITIONS.map(([x, y], i) => ({
      id: `p${playerId}-s${i + 1}`,
      playerId,
      label: `${i + 1}`,
      x: x * sign,
      y,
      radius: SOLDIER_RADIUS,
      alive: true,
    }));
  return [...make(1, 1), ...make(2, -1)];
}
