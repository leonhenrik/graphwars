import { EXPRESSION_EXAMPLES } from '../../game/expressionParser';

interface Props {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  onPreview: () => void;
  onFire: () => void;
  canFire: boolean;
  disabled: boolean;
  fireLabel: string;
}

export function FunctionInput({ value, onChange, error, onPreview, onFire, canFire, disabled, fireLabel }: Props) {
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
          y = f(x)
        </label>
        <input
          id="fn-input"
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
        <div className="button-row">
          <button type="button" className="btn" onClick={onPreview} disabled={disabled}>
            Preview
          </button>
          <button type="submit" className="btn primary" disabled={!canFire}>
            {fireLabel}
          </button>
        </div>
      </form>
      <details className="syntax" open>
        <summary>Syntax help</summary>
        <p>
          Variable <code>x</code>; operators <code>+ - * / ^</code>, parentheses. Functions: <code>sin cos tan sqrt abs log ln exp</code>{' '}
          (<code>log</code> is base 10, <code>ln</code> natural). Constants: <code>pi</code>, <code>e</code>.
        </p>
        <p className="examples">
          {EXPRESSION_EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => onChange(ex)} disabled={disabled}>
              {ex}
            </button>
          ))}
        </p>
        <p>
          The curve is shifted vertically to start at your soldier. Player 1 shoots right, Player 2 shoots left. The
          first thing the curve touches is hit — friends included.
        </p>
      </details>
    </section>
  );
}
