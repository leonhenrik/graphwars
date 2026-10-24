import { describe, expect, it } from 'vitest';
import { BOUNDS } from '../game/constants';
import { parseExpression } from '../game/expressionParser';
import { computeTrajectory } from '../game/trajectory';

function trajectory(expr: string, x0: number, y0: number, direction: 1 | -1) {
  const p = parseExpression(expr);
  if (!p.ok) throw new Error(p.error);
  return computeTrajectory(p.evaluate, { x: x0, y: y0 }, direction, BOUNDS);
}

describe('trajectory', () => {
  it('passes through the shooter coordinates (c = y0 - f(x0))', () => {
    for (const expr of ['sin(x)', 'x^2/10', '3*sin(x/2)', '5']) {
      const r = trajectory(expr, -12.3, 4.7, 1);
      if (!r.ok) throw new Error(r.error);
      const first = r.trajectory.points[0]!;
      expect(first.x).toBeCloseTo(-12.3, 10);
      expect(first.y).toBeCloseTo(4.7, 10);
    }
  });

  it('applies the vertical offset to every sample', () => {
    const r = trajectory('x^2/10', -10, 2, 1);
    if (!r.ok) throw new Error(r.error);
    for (const p of r.trajectory.points) {
      expect(p.y).toBeCloseTo((p.x ** 2) / 10 - 10 + 2, 8);
    }
  });

  it('moves right (increasing x) for direction +1 and ends at the right edge', () => {
    const r = trajectory('0', -20, 0, 1);
    if (!r.ok) throw new Error(r.error);
    const xs = r.trajectory.points.map((p) => p.x);
    expect(xs.every((x, i) => i === 0 || x > xs[i - 1]!)).toBe(true);
    expect(xs[xs.length - 1]).toBe(BOUNDS.maxX);
    expect(r.trajectory.end).toBe('boundary');
  });

  it('moves left (decreasing x) for direction -1 and ends at the left edge', () => {
    const r = trajectory('0', 20, 0, -1);
    if (!r.ok) throw new Error(r.error);
    const xs = r.trajectory.points.map((p) => p.x);
    expect(xs.every((x, i) => i === 0 || x < xs[i - 1]!)).toBe(true);
    expect(xs[xs.length - 1]).toBe(BOUNDS.minX);
  });

  it('stops when the curve leaves the battlefield vertically', () => {
    const r = trajectory('x^2', 0, 0, 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.trajectory.end).toBe('out-of-bounds');
    expect(r.trajectory.points.every((p) => p.y <= BOUNDS.maxY)).toBe(true);
  });

  it('stops safely at undefined values', () => {
    const r = trajectory('sqrt(x)', 5, 0, -1);
    if (!r.ok) throw new Error(r.error);
    expect(r.trajectory.end).toBe('undefined-value');
    expect(r.trajectory.points.length).toBeGreaterThan(1);
  });

  it('stops at discontinuities within the field', () => {
    // Step function: a jump of 12 between two adjacent in-bounds samples.
    const t = computeTrajectory((x) => (x < 0 ? 0 : 12), { x: -5, y: -6 }, 1, BOUNDS);
    if (!t.ok) throw new Error(t.error);
    expect(t.trajectory.end).toBe('discontinuity');
    expect(t.trajectory.points[t.trajectory.points.length - 1]!.x).toBeLessThan(0.001);
  });

  it('handles tan() asymptotes without crashing', () => {
    const r = trajectory('tan(x)', -20, 0, 1);
    if (!r.ok) throw new Error(r.error);
    expect(['out-of-bounds', 'discontinuity']).toContain(r.trajectory.end);
  });

  it('reports an error when f(x0) is undefined', () => {
    const r = trajectory('1/x', 0, 0, 1);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('undefined') });
  });

  it('survives an evaluator that throws or returns non-numbers', () => {
    const throwing = computeTrajectory(
      (x) => {
        if (x > 0) throw new Error('boom');
        return 0;
      },
      { x: -2, y: 0 },
      1,
      BOUNDS,
    );
    if (!throwing.ok) throw new Error(throwing.error);
    expect(throwing.trajectory.end).toBe('undefined-value');
    expect(computeTrajectory(() => Number.NaN, { x: 0, y: 0 }, 1, BOUNDS).ok).toBe(false);
  });
});
