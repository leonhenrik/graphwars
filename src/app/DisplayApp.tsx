import { useCallback, useEffect, useRef, useState } from 'react';
import { Battlefield, type ShotAnimation } from './components/Battlefield';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GameOverModal } from './components/GameOverModal';
import { Lobby } from './components/Lobby';
import { PlayerChips } from './components/PlayerChips';
import type { Effect } from './components/render';
import { TurnIndicator } from './components/TurnIndicator';
import { useSocket } from '../client/useSocket';
import { defaultDirection, getSoldier } from '../game/gameState';
import { getActiveSoldierId } from '../game/turnManager';
import type { MapId } from '../game/types';
import type { DisplayView, ServerMessage } from '../shared/protocol';

interface ServerInfo {
  port: number;
  addresses: string[];
}

/** The laptop screen: lobby with QR code, then the battlefield. No calculator here; phones are the controllers. */
export function DisplayApp() {
  const [view, setView] = useState<DisplayView | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [animation, setAnimation] = useState<ShotAnimation | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [confirm, setConfirm] = useState<'restart' | 'lobby' | null>(null);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const viewRef = useRef<DisplayView | null>(null);
  const animationRef = useRef<ShotAnimation | null>(null);
  const nextEffectId = useRef(1);

  const onMessage = useCallback((message: ServerMessage) => {
    if (message.type === 'display') {
      viewRef.current = message.view;
      setView(message.view);
      setRejected(null);
      if (!message.view.shotInFlight) {
        animationRef.current = null;
        setAnimation(null);
      }
    } else if (message.type === 'shot') {
      const next = { id: message.id, shot: message.shot, color: message.color };
      animationRef.current = next;
      setAnimation(next);
    } else if (message.type === 'rejected') {
      setRejected(message.text);
    }
  }, []);

  const { connected, send } = useSocket(() => ({ type: 'hello', role: 'display' }), onMessage);

  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json() as Promise<ServerInfo>)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const completeShot = useCallback(
    (id: number) => {
      const current = viewRef.current;
      const anim = animationRef.current;
      if (!anim || anim.id !== id) return;
      animationRef.current = null;
      const shot = anim.shot;
      const now = performance.now();
      const added: Effect[] = [];
      if (shot.outcome === 'hit-soldier' && current?.game) {
        const target = getSoldier(current.game, shot.targetId);
        const color = current.members.find((m) => m.playerId === target?.playerId)?.color ?? '#fff';
        if (target) {
          added.push({ id: nextEffectId.current++, kind: 'elimination', x: target.x, y: target.y, color, startedAt: now });
        }
      } else if (shot.outcome === 'hit-obstacle' && shot.impact) {
        added.push({
          id: nextEffectId.current++,
          kind: 'impact',
          x: shot.impact.x,
          y: shot.impact.y,
          color: anim.color,
          startedAt: now,
        });
      }
      setEffects((prev) => [...prev.filter((e) => now - e.startedAt < 1000), ...added]);
      setAnimation(null);
      send({ type: 'shotDone', id });
    },
    [send],
  );

  if (!view) {
    return (
      <div className="menu">
        <div className="menu-card">
          <h1>Graphwars</h1>
          <p className="menu-sub">{rejected ?? (connected ? 'Loading…' : 'Connecting to the game server…')}</p>
        </div>
      </div>
    );
  }

  if (view.phase === 'lobby' || !view.game) {
    const urls = info ? info.addresses.map((a) => `http://${a}:${info.port}/play`) : [];
    return (
      <Lobby
        members={view.members}
        mapId={view.mapId}
        seed={view.seed}
        joinUrls={urls}
        onConfigure={(mapId: MapId, seed: number) => send({ type: 'configure', mapId, seed })}
        onStart={() => send({ type: 'start' })}
        notice={view.notice?.kind === 'error' ? view.notice.text : null}
      />
    );
  }

  const game = view.game;
  const over = game.status === 'over';
  const activeId = over ? null : getActiveSoldierId(game);
  const activeSoldier = getSoldier(game, activeId);
  const direction = view.draft?.direction ?? (activeSoldier ? defaultDirection(activeSoldier) : 1);
  const current = view.members.find((m) => m.playerId === game.turn.currentPlayerId);
  const draft = view.draft;

  return (
    <div className="app display">
      <header className="header">
        <h1>Graphwars</h1>
        <TurnIndicator game={game} busy={view.shotInFlight} />
        <div className="header-actions">
          {!connected && <span className="status">Reconnecting…</span>}
          {!over && current && !current.connected && !view.shotInFlight && (
            <button className="btn" onClick={() => send({ type: 'skipTurn' })}>
              Skip {current.name}
            </button>
          )}
          <button className="btn" onClick={() => setConfirm('lobby')}>
            Lobby
          </button>
          <button className="btn" onClick={() => setConfirm('restart')}>
            Restart
          </button>
        </div>
      </header>

      <main className="main display-main">
        <div className="field-area">
          <Battlefield
            state={game}
            activeId={activeId}
            direction={direction}
            preview={draft?.points ?? null}
            animation={animation}
            effects={effects}
            onAnimationComplete={completeShot}
          />
        </div>
      </main>

      <footer className="statusbar">
        <PlayerChips members={view.members} game={game} />
        <div className="draft" data-testid="draft">
          {over ? null : view.shotInFlight ? (
            <span>Shot in flight…</span>
          ) : draft ? (
            <>
              <strong style={{ color: current?.color }}>{current?.name}</strong> y = <code>{draft.expression || '…'}</code>{' '}
              <span className="draft-dir">{draft.direction === 1 ? 'x →' : '← x'}</span>
              {draft.error && <span className="draft-error"> {draft.error}</span>}
            </>
          ) : current && !current.connected ? (
            <span className="draft-error">{current.name}'s phone is offline.</span>
          ) : (
            <span>Waiting for {current?.name} to enter a function…</span>
          )}
        </div>
        <div className={`message inline ${view.notice?.kind ?? ''}`} role="status" aria-live="polite" data-testid="message">
          {view.notice?.text}
        </div>
      </footer>

      {over && !animation && (
        <GameOverModal
          game={game}
          members={view.members}
          onPlayAgain={() => send({ type: 'restart' })}
          onLobby={() => send({ type: 'lobby' })}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm === 'lobby' ? 'Back to the lobby?' : 'Restart the match?'}
          confirmLabel={confirm === 'lobby' ? 'Lobby' : 'Restart'}
          onConfirm={() => {
            send({ type: confirm });
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
