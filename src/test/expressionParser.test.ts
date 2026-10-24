import { describe, expect, it } from 'vitest';
import { MAX_EXPRESSION_LENGTH } from '../game/constants';
import { parseExpression } from '../game/expressionParser';

function evalAt(expr: string, x: number): number {
  const r = parseExpression(expr);
  if (!r.ok) throw new Error(r.error);
  return r.evaluate(x);
}

describe('expressionParser – valid input', () => {
  it.each([
    ['sin(x)', Math.PI / 2, 1],
    ['x^2 / 10', 5, 2.5],
    ['3*sin(x/2)', Math.PI, 3],
    ['abs(x) / 2', -8, 4],
    ['(x^2) / 50', 10, 2],
    ['sqrt(abs(x)) * 2', -16, 8],
    ['cos(0) + x', 2, 3],
    ['tan(0)', 1, 0],
    ['ln(e)', 0, 1],
    ['log(100)', 0, 2],
    ['exp(0) + 1', 0, 2],
    ['2x + 1', 3, 7],
    ['-x + 4', 1, 3],
    ['2^3^2', 0, 512],
    ['pi', 0, Math.PI],
  ])('%s at x=%d', (expr, x, expected) => {
    expect(evalAt(expr, x)).toBeCloseTo(expected, 10);
  });
});

describe('expressionParser – invalid input', () => {
  it.each([
    '',
    '   ',
    'sin(',
    '2 +',
    '((x)',
    'x +* 2',
    'foo(x)',
    'y + 1',
    'sin(x, 2)',
    'x = 3',
    'x; 1',
    '[1,2,3]',
    '{a: 1}',
    '"hello"',
    'x.constructor',
    'constructor',
    'import("fs")',
    'x!',
    'x % 2',
    'x > 2',
    'sin',
    'f(x) = x',
    '1:5',
    'window.alert(1)',
    'process.exit()',
  ])('rejects %j with a safe error', (expr) => {
    const r = parseExpression(expr);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it('rejects over-long expressions', () => {
    const r = parseExpression('x+'.repeat(MAX_EXPRESSION_LENGTH) + '1');
    expect(r).toEqual({ ok: false, error: expect.stringContaining('too long') });
  });

  it('rejects over-complex expressions within the length limit', () => {
    const r = parseExpression(Array(100).fill('x').join('+'));
    expect(r.ok).toBe(false);
  });

  it('returns non-finite numbers instead of throwing for domain errors', () => {
    expect(evalAt('sqrt(x)', -1)).toBeNaN();
    expect(evalAt('log(x)', 0)).toBe(-Infinity);
    expect(evalAt('1/x', 0)).toBe(Infinity);
    expect(evalAt('(-8)^(1/3)', 0)).toBeNaN();
  });
});
