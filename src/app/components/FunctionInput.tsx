import { useLayoutEffect, useRef } from 'react';
import { EXPRESSION_EXAMPLES } from '../../game/expressionParser';

interface Props {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  onPreview: () => void;
  onFire: () => void;
  onToggleDirection: () => void;
  direction: 1 | -1;
  canFire: boolean;
  disabled: boolean;
  fireLabel: string;
}

interface Key {
  label: string;
  /** Text to insert; defaults to the label. */
  insert?: string;
  /** Cursor offset from the end of the inserted text (e.g. -1 to land inside "sin()"). */
  caret?: number;
  kind?: 'fn' | 'op' | 'num' | 'action';
  title?: string;
}

const fn = (name: string): Key => ({ label: name, insert: `${name}()`, caret: -1, kind: 'fn' });
const num = (c: string): Key => ({ label: c, kind: 'num' });
const op = (c: string, label = c): Key => ({ label, insert: c, kind: 'op' });

const KEYS: Key[] = [
  num('7'), num('8'), num('9'), op('('), op(')'),
  num('4'), num('5'), num('6'), op('*', '×'), op('/', '÷'),
  num('1'), num('2'), num('3'), op('+'), op('-', '−'),
  num('0'), num('.'), { label: 'x', kind: 'op' }, op('^'), { label: '⌫', kind: 'action', title: 'Backspace' },
  fn('sin'), fn('cos'), fn('tan'), fn('sqrt'), fn('abs'),
  fn('log'), fn('ln'), fn('exp'), { label: 'π', insert: 'pi', kind: 'op' }, { label: 'e', kind: 'op' },
];

export function FunctionInput({
  value,
  onChange,
  error,
  onPreview,
  onFire,
  onToggleDirection,
  direction,
  canFire,
  disabled,
  fireLabel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  // Restore the caret after React re-renders the controlled input.
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const edit = (build: (before: string, after: string) => { text: string; caret: number }) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const result = build(value.slice(0, start), value.slice(end));
    pendingCaret.current = result.caret;
    onChange(result.text);
    el?.focus();
  };

  const press = (key: Key) => {
    if (disabled) return;
    if (key.label === '⌫') {
      const el = inputRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      if (start === end) {
        if (start === 0) return;
        pendingCaret.current = start - 1;
        onChange(value.slice(0, start - 1) + value.slice(end));
      } else {
        pendingCaret.current = start;
        onChange(value.slice(0, start) + value.slice(end));
      }
      el?.focus();
      return;
    }
    const text = key.insert ?? key.label;
    edit((before, after) => ({
      text: before + text + after,
      caret: before.length + text.length + (key.caret ?? 0),
    }));
  };

  return (
    <section className="panel-section" aria-label="Function">
      <h2>Your shot</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canFire) onFire();
        }}
      >
        <label htmlFor="fn-input" className="fn-label">
          y = f(x) <span className="fn-hint">· you are at x = 0, y = 0</span>
        </label>
        <input
          id="fn-input"
          ref={inputRef}
          className={`fn-input${error ? ' invalid' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          maxLength={200}
          aria-invalid={error !== null}
          aria-describedby="fn-error"
          placeholder="e.g. sin(x)"
        />
        <div id="fn-error" className="fn-error" role="alert" data-testid="expression-error">
          {error}
        </div>

        <div className="keypad" role="group" aria-label="Calculator">
          {KEYS.map((key) => (
            <button
              key={key.label}
              type="button"
              className={`key ${key.kind ?? ''}`}
              disabled={disabled}
              title={key.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => press(key)}
            >
              {key.label}
            </button>
          ))}
          <button
            type="button"
            className="key action wide"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              pendingCaret.current = 0;
              onChange('');
              inputRef.current?.focus();
            }}
          >
            Clear
          </button>
        </div>

        <button
          type="button"
          className="btn direction"
          onClick={onToggleDirection}
          disabled={disabled}
          data-testid="direction-toggle"
        >
          x direction: {direction === 1 ? 'right →' : '← left'} (flip)
        </button>

        <div className="button-row">
          <button type="button" className="btn" onClick={onPreview} disabled={disabled}>
            Preview
          </button>
          <button type="submit" className="btn primary" disabled={!canFire}>
            {fireLabel}
          </button>
        </div>
      </form>
      <details className="syntax">
        <summary>Syntax help</summary>
        <p>
          Variable <code>x</code>; operators <code>+ - * / ^</code>, parentheses. Functions:{' '}
          <code>sin cos tan sqrt abs log ln exp</code> (<code>log</code> is base 10, <code>ln</code> natural).
          Constants: <code>pi</code>, <code>e</code>.
        </p>
        <p className="examples">
          {EXPRESSION_EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => onChange(ex)} disabled={disabled}>
              {ex}
            </button>
          ))}
        </p>
        <p>
          You are always the origin (0, 0): x is measured from you, positive in the shooting direction, and the curve
          is shifted so it starts at you. Flip the direction to mirror the shot. The first thing the curve touches is
          hit.
        </p>
      </details>
    </section>
  );
}
