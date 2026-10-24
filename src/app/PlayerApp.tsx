import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator } from './components/Calculator';
import { useSocket } from '../client/useSocket';
import { DEFAULT_EXPRESSION } from '../game/constants';
import type { ShotDirection } from '../game/types';
import type { PlayerView, ServerMessage } from '../shared/protocol';

const TOKEN_KEY = 'graphwars-token';
const EXPR_KEY = 'graphwars-expression';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: seat just won't survive a reload */
  }
}

/** The phone: a calculator for the player's own turn. The battlefield lives on the laptop. */
export function PlayerApp() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [expression, setExpression] = useState(() => read(EXPR_KEY) ?? DEFAULT_EXPRESSION);
  const [direction, setDirection] = useState<ShotDirection>(1);
  const tokenRef = useRef<string | null>(read(TOKEN_KEY));

  const onMessage = useCallback((message: ServerMessage) => {
    if (message.type === 'welcome') {
      tokenRef.current = message.token;
      write(TOKEN_KEY, message.token);
      setRejected(null);
    } else if (message.type === 'player') {
      setView(message.view);
    } else if (message.type === 'rejected') {
      setRejected(message.text);
      setView(null);
    }
  }, []);

  const { connected, send } = useSocket(() => ({ type: 'hello', role: 'player', token: tokenRef.current }), onMessage);

  const isMyTurn = view?.isMyTurn === true;
  const turnNumber = view?.turnNumber ?? 0;
  const turnDirection = view?.turnDirection ?? 1;

  // A new turn starts facing the middle of the field and buzzes the phone.
  useEffect(() => {
    if (!isMyTurn) return;
    setDirection(turnDirection);
    if ('vibrate' in navigator) navigator.vibrate(200);
  }, [isMyTurn, turnNumber, turnDirection]);

  useEffect(() => {
    write(EXPR_KEY, expression);
  }, [expression]);

  // Live preview on the big screen: send the draft while it is my turn.
  useEffect(() => {
    if (!isMyTurn) return;
    const timer = setTimeout(() => send({ type: 'draft', expression, direction }), 60);
    return () => clearTimeout(timer);
  }, [isMyTurn, turnNumber, expression, direction, send]);

  const fire = useCallback(() => send({ type: 'fire', expression, direction }), [send, expression, direction]);

  if (!view) {
    return (
      <div className="phone">
        <div className="phone-card">
          <h1>Graphwars</h1>
          <p className="menu-sub">{rejected ?? (connected ? 'Joining…' : 'Connecting to the game…')}</p>
          {rejected && (
            <button className="btn primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const { you } = view;
  const out = !you.alive;
  let status: string;
  let tone: 'go' | 'wait' | 'out' = 'wait';
  if (view.phase === 'lobby') status = `Waiting for the host to start (${view.playerCount} joined)`;
  else if (view.phase === 'over') {
    status = view.winnerId === you.playerId ? 'You won! 🎉' : view.winnerId ? `Player ${view.winnerId} won` : 'Draw';
  } else if (out) {
    status = 'You were eliminated. Watch the big screen.';
    tone = 'out';
  } else if (view.isMyTurn) {
    status = 'Your turn! Enter a function and fire.';
    tone = 'go';
  } else if (view.shotInFlight) status = 'Shot in flight…';
  else status = `Waiting for ${view.currentPlayerName ?? 'the next player'}…`;

  const canFire = view.isMyTurn && view.draftError === null && expression.trim().length > 0 && connected;
  const fireLabel = view.isMyTurn ? 'Fire! 🚀' : view.shotInFlight ? 'Shot fired…' : 'Not your turn';

  return (
    <div className="phone" data-testid="phone">
      <header className="phone-header" style={{ borderColor: you.color }}>
        <span className="dot" style={{ background: you.color }} />
        <strong data-testid="phone-name">You are {you.name}</strong>
        {!connected && <span className="offline-tag">reconnecting…</span>}
      </header>
      <div className={`phone-status ${tone}`} data-testid="phone-status">
        {status}
      </div>

      {view.phase !== 'lobby' && (
        <Calculator
          value={expression}
          onChange={setExpression}
          error={view.isMyTurn ? view.draftError : null}
          onFire={fire}
          onToggleDirection={() => setDirection((d) => (d === 1 ? -1 : 1))}
          direction={direction}
          canFire={canFire}
          disabled={!view.isMyTurn || out}
          fireLabel={fireLabel}
        />
      )}
      {view.notice && view.phase !== 'lobby' && <div className={`message ${view.notice.kind}`}>{view.notice.text}</div>}
    </div>
  );
}
