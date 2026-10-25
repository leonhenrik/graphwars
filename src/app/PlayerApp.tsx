import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from './components/Avatar';
import { Calculator } from './components/Calculator';
import { Countdown } from './components/Countdown';
import { SelfieCard } from './components/SelfieCard';
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

function rulesSummary(view: PlayerView): string {
  const { options } = view;
  const parts = [
    options.shotMode === 'simultaneous' ? 'All at once' : 'One after another',
    options.preview ? 'preview on' : 'preview off',
    options.countdownEnabled ? `${options.countdownSeconds}s countdown` : 'no countdown',
  ];
  return parts.join(' · ');
}

function statusOf(view: PlayerView): { text: string; tone: 'go' | 'wait' | 'out' } {
  const { you } = view;
  const simultaneous = view.options.shotMode === 'simultaneous';
  if (view.phase === 'lobby') return { text: `Waiting for the host to start (${view.playerCount} joined)`, tone: 'wait' };
  if (view.phase === 'over') {
    const text =
      view.winnerId === you.playerId ? 'You won! 🎉' : view.winnerId !== null ? `${view.winnerName ?? `Player ${view.winnerId}`} won` : 'Draw — nobody is left';
    return { text, tone: 'wait' };
  }
  if (!you.alive) return { text: 'You were eliminated. Watch the big screen.', tone: 'out' };
  if (view.shotInFlight) return { text: simultaneous ? 'Shots in flight…' : 'Shot in flight…', tone: 'wait' };
  if (view.canAct) {
    return {
      text: simultaneous ? `Enter a function and fire!` : 'Enter a function and fire.',
      tone: 'go',
    };
  }
  if (simultaneous && view.submitted) {
    return { text: `Locked in ✓ Waiting for the others (${view.firedCount}/${view.livingCount})`, tone: 'wait' };
  }
  return { text: `Waiting for ${view.currentPlayerName ?? 'the next player'}…`, tone: 'wait' };
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

  const canAct = view?.canAct === true;
  const turnNumber = view?.turnNumber ?? 0;
  const turnDirection = view?.turnDirection ?? 1;
  const matchId = view?.matchId ?? null;

  // The x direction is the player's own setting: it starts facing the middle of the field once per match and
  // is then kept across rounds (it only changes when the player flips it).
  const seenMatch = useRef<number | null>(null);
  useEffect(() => {
    if (matchId === null || seenMatch.current === matchId) return;
    seenMatch.current = matchId;
    setDirection(turnDirection);
  }, [matchId, turnDirection]);

  // Buzz the phone when it is my turn (or a new round starts).
  useEffect(() => {
    if (canAct && 'vibrate' in navigator) navigator.vibrate(200);
  }, [canAct, turnNumber]);

  useEffect(() => {
    write(EXPR_KEY, expression);
  }, [expression]);

  // Live preview on the big screen: send the draft while I am allowed to act.
  useEffect(() => {
    if (!canAct) return;
    const timer = setTimeout(() => send({ type: 'draft', expression, direction }), 60);
    return () => clearTimeout(timer);
  }, [canAct, turnNumber, expression, direction, send]);

  const fire = useCallback(() => send({ type: 'fire', expression, direction }), [send, expression, direction]);

  if (!view) {
    return (
      <div className="phone">
        <div className="phone-card">
          <h1 className="brand">
            Graph<span>wars</span>
          </h1>
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
  const status = statusOf(view);
  const submittedNow = view.options.shotMode === 'simultaneous' && view.submitted;
  const canFire = canAct && view.draftError === null && expression.trim().length > 0 && connected;
  const fireLabel = canAct ? 'Fire! 🚀' : submittedNow ? 'Locked in ✓' : view.shotInFlight ? 'Shot fired…' : 'Not your turn';

  return (
    <div className="phone" data-testid="phone">
      <header className="phone-header" style={{ borderColor: you.color }}>
        <Avatar member={you} size={30} />
        <strong data-testid="phone-name">{you.name}</strong>
        {!connected && <span className="offline-tag">reconnecting…</span>}
        <span className={`phone-status ${status.tone}`} data-testid="phone-status">
          {status.text}
        </span>
        {view.phase !== 'lobby' && (
          <span className="phone-round" data-testid="phone-round">
            {view.options.shotMode === 'simultaneous' ? 'Round' : 'Turn'} {view.turnNumber}
          </span>
        )}
      </header>
      {view.phase === 'lobby' && <div className="phone-rules">{rulesSummary(view)}</div>}
      {view.phase === 'lobby' && (
        <SelfieCard
          you={you}
          disabled={!connected}
          onPhoto={(image) => send({ type: 'photo', image })}
          onName={(name) => send({ type: 'name', name })}
        />
      )}
      {view.phase === 'playing' && <Countdown timer={view.timer} />}

      {view.phase !== 'lobby' && (
        <Calculator
          value={expression}
          onChange={setExpression}
          error={canAct ? view.draftError : null}
          onFire={fire}
          onToggleDirection={() => setDirection((d) => (d === 1 ? -1 : 1))}
          direction={direction}
          canFire={canFire}
          disabled={!canAct || !you.alive}
          fireLabel={fireLabel}
        />
      )}
    </div>
  );
}
