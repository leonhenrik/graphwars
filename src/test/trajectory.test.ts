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
  it('passes through the shooter coordinates in both directions', () => {
    for (const dir of [1, -1] as const) {
      for (const expr of ['sin(x)', 'x^2/10', '3*sin(x/2)', '5', 'cos(x)']) {
        const r = trajectory(expr, -12.3, 4.7, dir);
        if (!r.ok) throw new Error(r.error);
        const first = r.trajectory.points[0]!;
        expect(first.x).toBeCloseTo(-12.3, 10);
        expect(first.y).toBeCloseTo(4.7, 10);
      }
    }
  });

  it('treats the shooter as the origin: Y = y0 + f(u) - f(0), u measured from the shooter', () => {
    const r = trajectory('x^2/10 + 3', -10, 2, 1);
    if (!r.ok) throw new Error(r.error);
    for (const p of r.trajectory.points) {
      const u = p.x - -10;
      expect(p.y).toBeCloseTo(2 + u ** 2 / 10, 8);
    }
  });

  it('evaluates f at local x, independent of the shooter position', () => {
    const a = trajectory('x^2/20', -15, 0, 1);
    const b = trajectory('x^2/20', 5, 0, 1);
    if (!a.ok || !b.ok) throw new Error('unexpected');
    // Same local curve, so the first few samples have identical y offsets.
    for (let i = 0; i < 40; i++) expect(a.trajectory.points[i]!.y).toBeCloseTo(b.trajectory.points[i]!.y, 10);
  });

  it('moves right (increasing x) for direction +1 and ends at the right edge', () => {
    const r = trajectory('0', -20, 0, 1);
    if (!r.ok) throw new Error(r.error);
    const xs = r.trajectory.points.map((p) => p.x);
    expect(xs.every((x, i) => i === 0 || x > xs[i - 1]!)).toBe(true);
    expect(xs[xs.length - 1]).toBeCloseTo(BOUNDS.maxX, 10);
    expect(r.trajectory.end).toBe('boundary');
  });

  it('moves left (decreasing x) for direction -1 and ends at the left edge', () => {
    const r = trajectory('0', 20, 0, -1);
    if (!r.ok) throw new Error(r.error);
    const xs = r.trajectory.points.map((p) => p.x);
    expect(xs.every((x, i) => i === 0 || x < xs[i - 1]!)).toBe(true);
    expect(xs[xs.length - 1]).toBeCloseTo(BOUNDS.minX, 10);
  });

  it('flipping the direction mirrors the curve horizontally around the shooter', () => {
    const right = trajectory('sin(x)', 0, 0, 1);
    const left = trajectory('sin(x)', 0, 0, -1);
    if (!right.ok || !left.ok) throw new Error('unexpected');
    for (let i = 0; i < 100; i++) {
      const r = right.trajectory.points[i]!;
      const l = left.trajectory.points[i]!;
      expect(l.x).toBeCloseTo(-r.x, 10);
      expect(l.y).toBeCloseTo(r.y, 10);
    }
  });

  it('stops when the curve leaves the battlefield vertically', () => {
    const r = trajectory('x^2', 0, 0, 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.trajectory.end).toBe('out-of-bounds');
    expect(r.trajectory.points.every((p) => p.y <= BOUNDS.maxY)).toBe(true);
  });

  it('stops safely at undefined values', () => {
    const r = trajectory('sqrt(5 - x)', 5, 0, -1);
    if (!r.ok) throw new Error(r.error);
    expect(r.trajectory.end).toBe('undefined-value');
    expect(r.trajectory.points.length).toBeGreaterThan(1);
  });

  it('stops at discontinuities', () => {
    const t = computeTrajectory((u) => (u < 5 ? 0 : 12), { x: -5, y: -6 }, 1, BOUNDS);
    if (!t.ok) throw new Error(t.error);
    expect(t.trajectory.end).toBe('discontinuity');
    expect(t.trajectory.points[t.trajectory.points.length - 1]!.x).toBeLessThan(0.001);
  });

  it('handles tan() asymptotes without crashing', () => {
    const r = trajectory('tan(x)', -20, 0, 1);
    if (!r.ok) throw new Error(r.error);
    expect(['out-of-bounds', 'discontinuity']).toContain(r.trajectory.end);
  });

  it('reports an error when f(0) is undefined', () => {
    const r = trajectory('1/x', 0, 0, 1);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('undefined') });
  });

  it('survives an evaluator that throws or returns non-numbers', () => {
    const throwing = computeTrajectory(
      (u) => {
        if (u > 1) throw new Error('boom');
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

  it('a shooter standing at the edge facing outwards has a single-point path', () => {
    const r = trajectory('0', 25, 0, 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.trajectory.points).toHaveLength(1);
  });
});
