import { describe, expect, it } from 'vitest';
import { partialPath, pathLength, shotDurationMs } from '../app/components/render';
import type { TrajectoryPoint } from '../game/types';

describe('shot animation speed', () => {
  it('uses a duration proportional to path length at a constant speed', () => {
    const shortPath: TrajectoryPoint[] = [{ x: 0, y: 0 }, { x: 9, y: 0 }];
    const longPath: TrajectoryPoint[] = [{ x: 0, y: 0 }, { x: 90, y: 0 }];

    expect(shotDurationMs(shortPath)).toBe(500);
    expect(shotDurationMs(longPath)).toBe(5000);
    expect(pathLength(longPath) / (shotDurationMs(longPath) / 1000)).toBe(18);
  });

  it('advances along curved paths by distance rather than sample count', () => {
    const points: TrajectoryPoint[] = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 9, y: 4 }];
    const halfPath = partialPath(points, 0.5);

    expect(pathLength(halfPath)).toBeCloseTo(pathLength(points) / 2);
  });
});
