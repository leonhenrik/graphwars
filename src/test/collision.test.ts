import { describe, expect, it } from 'vitest';
import { findFirstCollision, segmentCircleEntry, type CircleTarget } from '../game/collision';

const circle = (id: string, x: number, y: number, radius = 1): CircleTarget => ({
  id,
  kind: 'soldier',
  x,
  y,
  radius,
});

describe('segmentCircleEntry', () => {
  it('returns the entry fraction for a segment crossing a circle', () => {
    const t = segmentCircleEntry({ x: -5, y: 0 }, { x: 5, y: 0 }, 0, 0, 1);
    expect(t).toBeCloseTo(0.4, 10);
  });

  it('returns null for a miss and for segments that stop short', () => {
    expect(segmentCircleEntry({ x: -5, y: 3 }, { x: 5, y: 3 }, 0, 0, 1)).toBeNull();
    expect(segmentCircleEntry({ x: -5, y: 0 }, { x: -2, y: 0 }, 0, 0, 1)).toBeNull();
  });

  it('returns 0 when the segment starts inside the circle', () => {
    expect(segmentCircleEntry({ x: 0.2, y: 0 }, { x: 5, y: 0 }, 0, 0, 1)).toBe(0);
  });

  it('catches steep segments that a point-sampling check would skip', () => {
    expect(segmentCircleEntry({ x: 0, y: -10 }, { x: 0.05, y: 10 }, 0, 0, 0.5)).not.toBeNull();
  });

  it('handles degenerate zero-length segments', () => {
    expect(segmentCircleEntry({ x: 3, y: 3 }, { x: 3, y: 3 }, 0, 0, 1)).toBeNull();
  });
});

describe('findFirstCollision', () => {
  const path = [
    { x: -10, y: 0 },
    { x: -5, y: 0 },
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 10, y: 0 },
  ];

  it('returns the first target along the path, regardless of target order', () => {
    const far = circle('far', 6, 0);
    const near = circle('near', -3, 0);
    const hit = findFirstCollision(path, [far, near]);
    expect(hit?.target.id).toBe('near');
    expect(hit?.point.x).toBeCloseTo(-4, 10);
    expect(hit?.segmentIndex).toBe(1);
  });

  it('picks the earliest entry when two targets share one segment', () => {
    const hit = findFirstCollision(path, [circle('b', 3, 0), circle('a', 1, 0)]);
    expect(hit?.target.id).toBe('a');
  });

  it('returns null when nothing is hit', () => {
    expect(findFirstCollision(path, [circle('off', 0, 5)])).toBeNull();
    expect(findFirstCollision([{ x: 0, y: 0 }], [circle('x', 0, 0)])).toBeNull();
  });
});
