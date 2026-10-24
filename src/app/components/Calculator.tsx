import { useLayoutEffect, useRef } from 'react';
import { EXPRESSION_EXAMPLES } from '../../game/expressionParser';

interface Props {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
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

/** The on-phone calculator: a display of y = f(x), a keypad, the direction flip and the fire button. */
export function Calculator({
  value,
  onChange,
  error,
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

  const selection = () => {
    const el = inputRef.current;
    return { start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length };
  };

  const moveCaret = (delta: -1 | 1) => {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    const { start, end } = selection();
    // With a selection, collapse to its edge; otherwise step one character.
    const next =
      start !== end ? (delta < 0 ? start : end) : Math.min(value.length, Math.max(0, start + delta));
    el.focus();
    el.setSelectionRange(next, next);
  };

  const press = (key: Key) => {
    if (disabled) return;
    const { start, end } = selection();
    if (key.label === '⌫') {
      if (start === end && start === 0) return;
      const from = start === end ? start - 1 : start;
      pendingCaret.current = from;
      onChange(value.slice(0, from) + value.slice(end));
    } else {
      const text = key.insert ?? key.label;
      pendingCaret.current = start + text.length + (key.caret ?? 0);
      onChange(value.slice(0, start) + text + value.slice(end));
    }
    inputRef.current?.focus();
  };

  return (
    <section className="calculator" aria-label="Calculator">
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
          // No on-screen keyboard on phones: the keypad below is the input.
          inputMode="none"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          maxLength={200}
          aria-invalid={error !== null}
          aria-describedby="fn-error"
          placeholder="e.g. sin(x)"
        />
        <div id="fn-error" className="fn-error" role="alert" data-testid="expression-error">
          {error}
        </div>

        <div className="keypad" role="group" aria-label="Keypad">
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
        </div>

        <div className="tool-row">
          <button
            type="button"
            className="btn cursor"
            disabled={disabled}
            title="Move cursor back"
            aria-label="Move cursor back"
            data-testid="cursor-back"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => moveCaret(-1)}
          >
            ◀
          </button>
          <button
            type="button"
            className="btn cursor"
            disabled={disabled}
            title="Move cursor forward"
            aria-label="Move cursor forward"
            data-testid="cursor-forward"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => moveCaret(1)}
          >
            ▶
          </button>
          <button
            type="button"
            className="btn clear"
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
          <button
            type="button"
            className="btn direction"
            onClick={onToggleDirection}
            disabled={disabled}
            data-testid="direction-toggle"
          >
            x direction: {direction === 1 ? 'right →' : '← left'}
          </button>
        </div>

        <button type="submit" className="btn primary fire" disabled={!canFire} data-testid="fire-button">
          {fireLabel}
        </button>
      </form>
      <details className="syntax">
        <summary>Syntax help</summary>
        <p>
          Variable <code>x</code>; operators <code>+ - * / ^</code>, parentheses. Functions:{' '}
          <code>sin cos tan sqrt abs log ln exp</code> (<code>log</code> is base 10). Constants: <code>pi</code>,{' '}
          <code>e</code>.
        </p>
        <p className="examples">
          {EXPRESSION_EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => onChange(ex)} disabled={disabled}>
              {ex}
            </button>
          ))}
        </p>
        <p>
          You are always the origin (0, 0): x is measured from you, positive in the shooting direction. Flip the
          direction to mirror the shot. The first thing the curve touches is hit.
        </p>
      </details>
    </section>
  );
}
