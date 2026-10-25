import { describe, expect, it } from 'vitest';
import { idealPathLength, shotAccuracy } from '../game/shotScore';
import type { Battlefield } from '../game/types';

const open: Battlefield = { bounds: { minX: -25, maxX: 25, minY: -15, maxY: 15 }, obstacles: [] };
const blocked: Battlefield = {
  ...open,
  obstacles: [{ id: 'o', x: 0, y: 0, radius: 1 }],
};

describe('idealPathLength', () => {
  it('is the straight distance when there are no obstacles', () => {
    expect(idealPathLength(open, { x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 6);
  });

  it('goes around an obstacle that sits on the straight line', () => {
    const d = idealPathLength(blocked, { x: -5, y: 0 }, { x: 5, y: 0 });
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(10.6);
  });
});

describe('shotAccuracy', () => {
  it('scores a straight shot as 100', () => {
    const impact = { x: 2.4, y: 3.2 };
    const travelled = [{ x: 0, y: 0 }, impact];
    expect(shotAccuracy(open, { x: 0, y: 0 }, { x: 3, y: 4 }, travelled, impact)).toBe(100);
  });

  it('scores a detour lower than the ideal', () => {
    const impact = { x: 2.4, y: 3.2 };
    const travelled = [{ x: 0, y: 0 }, { x: 0, y: 2 }, impact];
    const score = shotAccuracy(open, { x: 0, y: 0 }, { x: 3, y: 4 }, travelled, impact);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThan(100);
  });
});
