import { create, parseDependencies, type FactoryFunctionMap } from 'mathjs';
import { MAX_EXPRESSION_LENGTH, MAX_EXPRESSION_NODES } from './constants';

/**
 * Safe expression parsing.
 *
 * mathjs is used ONLY to turn text into a syntax tree. The tree is then validated against a strict
 * whitelist and evaluated by our own small interpreter over plain JS numbers. Player input is never
 * passed to eval()/new Function(), and mathjs' own evaluator (with its complex numbers, units,
 * matrices, assignments, etc.) is never used.
 *
 * Supported syntax:
 *   variable      x
 *   operators     + - * / ^ and implicit multiplication (2x, 3(x+1))
 *   grouping      ( )
 *   functions     sin cos tan sqrt abs log (base 10) ln (natural) exp
 *   constants     pi, e
 */

const math = create(parseDependencies as FactoryFunctionMap);

export const ALLOWED_FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
};

export const ALLOWED_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

export const EXPRESSION_EXAMPLES = [
  'sin(x)',
  'x^2 / 10',
  '3*sin(x/2)',
  'abs(x) / 2',
  '(x^2) / 50',
  'sqrt(abs(x)) * 2',
];

export type Evaluator = (x: number) => number;

export type ParseResult = { ok: true; evaluate: Evaluator } | { ok: false; error: string };

interface AstNode {
  type?: string;
  value?: unknown;
  name?: string;
  op?: string;
  fn?: unknown;
  args?: AstNode[];
  content?: AstNode;
}

type Compiled = (x: number) => number;

class ExpressionError extends Error {}

function compileNode(node: AstNode, state: { count: number }): Compiled {
  state.count += 1;
  if (state.count > MAX_EXPRESSION_NODES) {
    throw new ExpressionError('Expression is too complex.');
  }

  switch (node.type) {
    case 'ConstantNode': {
      if (typeof node.value !== 'number' || !Number.isFinite(node.value)) {
        throw new ExpressionError('Only numeric constants are allowed.');
      }
      const value = node.value;
      return () => value;
    }
    case 'SymbolNode': {
      const name = node.name ?? '';
      if (name === 'x') return (x) => x;
      if (Object.prototype.hasOwnProperty.call(ALLOWED_CONSTANTS, name)) {
        const value = ALLOWED_CONSTANTS[name] as number;
        return () => value;
      }
      throw new ExpressionError(`Unknown symbol "${name}". Use x, pi or e.`);
    }
    case 'ParenthesisNode': {
      if (!node.content) throw new ExpressionError('Empty parentheses.');
      return compileNode(node.content, state);
    }
    case 'OperatorNode': {
      const args = (node.args ?? []).map((a) => compileNode(a, state));
      const a = args[0];
      const b = args[1];
      switch (node.fn) {
        case 'unaryMinus':
          if (a && args.length === 1) return (x) => -a(x);
          break;
        case 'unaryPlus':
          if (a && args.length === 1) return a;
          break;
        case 'add':
          if (a && b && args.length === 2) return (x) => a(x) + b(x);
          break;
        case 'subtract':
          if (a && b && args.length === 2) return (x) => a(x) - b(x);
          break;
        case 'multiply':
          if (a && b && args.length === 2) return (x) => a(x) * b(x);
          break;
        case 'divide':
          if (a && b && args.length === 2) return (x) => a(x) / b(x);
          break;
        case 'pow':
          if (a && b && args.length === 2) return (x) => Math.pow(a(x), b(x));
          break;
      }
      throw new ExpressionError(`Operator "${node.op ?? '?'}" is not supported.`);
    }
    case 'FunctionNode': {
      const fnNode = node.fn as AstNode | undefined;
      const name = fnNode?.type === 'SymbolNode' ? (fnNode.name ?? '') : '';
      if (!Object.prototype.hasOwnProperty.call(ALLOWED_FUNCTIONS, name)) {
        throw new ExpressionError(
          `Unknown function "${name || '?'}". Allowed: ${Object.keys(ALLOWED_FUNCTIONS).join(', ')}.`,
        );
      }
      const args = node.args ?? [];
      if (args.length !== 1 || !args[0]) {
        throw new ExpressionError(`Function "${name}" takes exactly one argument.`);
      }
      const fn = ALLOWED_FUNCTIONS[name] as (v: number) => number;
      const arg = compileNode(args[0], state);
      return (x) => fn(arg(x));
    }
    default:
      throw new ExpressionError('This syntax is not supported. Use numbers, x, + - * / ^, ( ) and functions.');
  }
}

function cleanParserMessage(message: string): string {
  return message.replace(/\s*\(char \d+\)/g, '').trim();
}

/** Parses player input into a pure number->number evaluator, or returns a safe error message. */
export function parseExpression(input: string): ParseResult {
  const text = input.trim();
  if (text.length === 0) return { ok: false, error: 'Enter a function of x, e.g. sin(x).' };
  if (text.length > MAX_EXPRESSION_LENGTH) {
    return { ok: false, error: `Expression is too long (max ${MAX_EXPRESSION_LENGTH} characters).` };
  }

  try {
    const ast = math.parse(text) as unknown as AstNode;
    const compiled = compileNode(ast, { count: 0 });
    return { ok: true, evaluate: (x) => compiled(x) };
  } catch (err) {
    if (err instanceof ExpressionError) return { ok: false, error: err.message };
    const message = err instanceof Error ? cleanParserMessage(err.message) : '';
    return { ok: false, error: message ? `Cannot parse expression: ${message}` : 'Cannot parse expression.' };
  }
}
