import { useLayoutEffect, useRef } from 'react';

/** A short tick for every calculator tap (no-op where the device has no vibration). */
function buzz(): void {
  if ('vibrate' in navigator) navigator.vibrate(12);
}

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
    buzz();
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
    buzz();
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
          if (canFire) {
            buzz();
            onFire();
          }
        }}
      >
        <input
          id="fn-input"
          aria-label="y = f(x)"
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

        <div id="fn-error" className="fn-error" role="alert" data-testid="expression-error">
          {error}
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
              buzz();
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
            onClick={() => {
              buzz();
              onToggleDirection();
            }}
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
    </section>
  );
}
