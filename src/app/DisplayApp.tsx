import { useCallback, useEffect, useRef, useState } from 'react';
import { Battlefield, type ShotAnimation } from './components/Battlefield';
import { BrandMark } from './components/BrandMark';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Countdown } from './components/Countdown';
import { GameOverModal } from './components/GameOverModal';
import { Lobby } from './components/Lobby';
import { PlayerChips } from './components/PlayerChips';
import { LABEL_DURATION_MS, type DirectionLine, type Effect, type PathLine } from './components/render';
import { TurnIndicator } from './components/TurnIndicator';
import { useSocket } from '../client/useSocket';
import { defaultDirection, getPlayerSoldier, getSoldier } from '../game/gameState';
import { getActiveSoldierId } from '../game/turnManager';
import type { GameOptions, MapId } from '../game/types';
import { photoUrl, type DisplayView, type ServerMessage } from '../shared/protocol';

interface ServerInfo {
  port: number;
  addresses: string[];
}

/** The laptop screen: lobby with QR code, then the battlefield. No calculator here; phones are the controllers. */
export function DisplayApp() {
  const [view, setView] = useState<DisplayView | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [displayToken, setDisplayToken] = useState('');
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [animation, setAnimation] = useState<ShotAnimation | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [traces, setTraces] = useState<PathLine[]>([]);
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
      // A fresh match (or the lobby) starts without traces of earlier shots.
      if (message.view.phase === 'lobby' || message.view.game?.turn.turnNumber === 1) setTraces([]);
    } else if (message.type === 'shots') {
      const next = { id: message.id, shots: message.shots };
      animationRef.current = next;
      setAnimation(next);
    } else if (message.type === 'rejected') {
      setRejected(message.text);
    }
  }, []);

  const { connected, send } = useSocket(
    () => __VERCEL_DEPLOYMENT__
      ? { type: 'hello', role: 'display', token: displayToken }
      : { type: 'hello', role: 'display' },
    onMessage,
  );

  useEffect(() => {
    if (__VERCEL_DEPLOYMENT__) return;
    fetch('/api/info')
      .then((r) => r.json() as Promise<ServerInfo>)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const photoMembers = view?.members.flatMap((member) => {
    const url = photoUrl(member);
    return url ? [{ playerId: member.playerId, url }] : [];
  }) ?? [];
  const photoKey = photoMembers.map(({ playerId, url }) => `${playerId}:${url}`).join('|');

  useEffect(() => {
    setPhotoError(null);
    if (!__VERCEL_DEPLOYMENT__) {
      setPhotoUrls(Object.fromEntries(photoMembers.map(({ playerId, url }) => [playerId, url])));
      return;
    }
    if (!displayToken || photoMembers.length === 0) {
      setPhotoUrls({});
      return;
    }

    const controller = new AbortController();
    const objectUrls: string[] = [];
    setPhotoUrls({});
    void (async () => {
      try {
        const entries: Array<readonly [number, string]> = [];
        for (const { playerId, url } of photoMembers) {
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${displayToken}` },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Photo request failed with status ${response.status}`);
          const objectUrl = URL.createObjectURL(await response.blob());
          objectUrls.push(objectUrl);
          entries.push([playerId, objectUrl]);
        }
        setPhotoUrls(Object.fromEntries(entries));
      } catch {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        if (!controller.signal.aborted) setPhotoError('Unable to load player photos. Check the host access token and reconnect.');
      }
    })();

    return () => {
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoKey, displayToken]);

  const completeShots = useCallback(
    (id: number) => {
      const current = viewRef.current;
      const anim = animationRef.current;
      if (!anim || anim.id !== id) return;
      animationRef.current = null;
      const now = performance.now();
      const added: Effect[] = [];
      for (const { shot, color } of anim.shots) {
        if (shot.outcome === 'hit-soldier' && current?.game) {
          const target = getSoldier(current.game, shot.targetId);
          const targetColor = current.members.find((m) => m.playerId === target?.playerId)?.color ?? '#fff';
          if (target) {
            const label = shot.accuracy === null ? undefined : `${shot.accuracy}%`;
            added.push({ id: nextEffectId.current++, kind: 'elimination', x: target.x, y: target.y, color: targetColor, startedAt: now, label });
          }
        } else if (shot.outcome === 'hit-obstacle' && shot.impact) {
          added.push({ id: nextEffectId.current++, kind: 'impact', x: shot.impact.x, y: shot.impact.y, color, startedAt: now });
        }
      }
      setEffects((prev) => [...prev.filter((e) => now - e.startedAt < LABEL_DURATION_MS), ...added]);
      setTraces(anim.shots.map(({ shot, color }) => ({ points: shot.points, color })));
      setAnimation(null);
      send({ type: 'shotDone', id });
    },
    [send],
  );

  const configure = useCallback(
    (mapId: MapId, seed: number, options: GameOptions) => send({ type: 'configure', mapId, seed, options }),
    [send],
  );

  if (!view) {
    return (
      <div className="lobby-page">
        <div className="lobby-card">
          <h1 className="brand">Graphwars</h1>
          <p className="menu-sub">{rejected ?? (connected ? 'Loading…' : 'Connecting to the game server…')}</p>
          {__VERCEL_DEPLOYMENT__ && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const token = displayToken.trim();
                if (!token) {
                  setRejected('Enter the host access token configured in Vercel.');
                  return;
                }
                setDisplayToken(token);
                setRejected(null);
                send({ type: 'hello', role: 'display', token });
              }}
            >
              <label>
                Host access token
                <input
                  className="display-token-input"
                  type="password"
                  autoComplete="off"
                  required
                  value={displayToken}
                  onChange={(event) => setDisplayToken(event.target.value)}
                />
              </label>
              <button className="btn primary" type="submit" disabled={!connected}>Connect as host</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (view.phase === 'lobby' || !view.game) {
    const urls = __VERCEL_DEPLOYMENT__
      ? [`${window.location.origin}/play`]
      : info
        ? info.addresses.map((a) => `http://${a}:${info.port}/play`)
        : [];
    return (
      <Lobby
        members={view.members}
        mapId={view.mapId}
        seed={view.seed}
        options={view.options}
        joinUrls={urls}
        onConfigure={configure}
        onStart={() => send({ type: 'start' })}
        notice={view.notice?.kind === 'error' ? view.notice.text : null}
      />
    );
  }

  const game = view.game;
  const over = game.status === 'over';
  const simultaneous = view.options.shotMode === 'simultaneous';
  const current = view.members.find((m) => m.playerId === game.turn.currentPlayerId);
  const colorOf = (playerId: number) => view.members.find((m) => m.playerId === playerId)?.color ?? '#fff';
  // Turn mode: the axes follow the active player. Simultaneous mode: plain world axes.
  const originId = over || simultaneous ? null : getActiveSoldierId(game);
  const originSoldier = getSoldier(game, originId);
  const activeDraft = view.drafts.find((d) => d.playerId === game.turn.currentPlayerId);
  const direction = activeDraft?.direction ?? (originSoldier ? defaultDirection(originSoldier) : 1);

  const waitingIds = over
    ? []
    : simultaneous
      ? game.soldiers.filter((s) => s.alive && !view.submitted.includes(s.playerId)).map((s) => s.id)
      : originId
        ? [originId]
        : [];
  const lockedIds = simultaneous ? view.submitted.flatMap((id) => getPlayerSoldier(game, id)?.id ?? []) : [];
  const previews: PathLine[] =
    view.options.preview === 'curve'
      ? view.drafts.flatMap((d) => (d.points ? [{ points: d.points, color: colorOf(d.playerId) }] : []))
      : [];
  const previewDirections: DirectionLine[] =
    view.options.preview === 'direction'
      ? view.drafts.flatMap((draft) => {
          const [start, next] = draft.points ?? [];
          if (!start || !next) return [];
          const dx = next.x - start.x;
          const dy = next.y - start.y;
          const length = Math.hypot(dx, dy);
          if (length === 0) return [];
          const arrowLength = 3;
          return [{
            start,
            end: { x: start.x + (dx / length) * arrowLength, y: start.y + (dy / length) * arrowLength },
            color: colorOf(draft.playerId),
          }];
        })
      : [];

  const someoneOffline = simultaneous
    ? view.members.some((m) => m.alive && !m.connected && !view.submitted.includes(m.playerId))
    : current !== undefined && !current.connected;

  return (
    <div className="app display">
      <header className="header">
        <div className="brand-lockup small">
          <BrandMark className="brand-mark small" />
          <h1 className="brand small">
            Graph<span>wars</span>
          </h1>
        </div>
        <TurnIndicator game={game} options={view.options} busy={view.shotInFlight} firedCount={view.submitted.length} />
        <Countdown timer={view.timer} />
        <div className="header-actions">
          {!connected && <span className="status">Reconnecting…</span>}
          {!over && someoneOffline && !view.shotInFlight && (
            <button className="btn" onClick={() => send({ type: 'skipTurn' })}>
              {simultaneous ? 'Fire now' : `Skip ${current?.name ?? 'turn'}`}
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
            originId={originId}
            activeIds={waitingIds}
            lockedIds={lockedIds}
            direction={direction}
            photos={photoUrls}
            previews={previews}
            previewDirections={previewDirections}
            traces={traces}
            animation={animation}
            effects={effects}
            onAnimationComplete={completeShots}
          />
        </div>
      </main>

      <footer className="statusbar">
        <PlayerChips
          members={view.members}
          activePlayerId={!over && !simultaneous ? game.turn.currentPlayerId : null}
          submitted={view.submitted}
        />
        <div className="draft" data-testid="draft">
          {over ? null : view.shotInFlight ? (
            <span>{simultaneous ? 'Shots in flight…' : 'Shot in flight…'}</span>
          ) : simultaneous ? (
            <span>
              Everyone is typing… <strong>{view.submitted.length}</strong>/{game.soldiers.filter((s) => s.alive).length} locked in
              {view.drafts.map((d) => d.error && (
                <span key={d.playerId} className="draft-error"> · {view.members.find((m) => m.playerId === d.playerId)?.name}: {d.error}</span>
              ))}
            </span>
          ) : activeDraft ? (
            <>
              <strong style={{ color: current?.color }}>{current?.name}</strong>{' '}
              {view.options.preview === 'curve' ? (
                <>
                  y = <code>{activeDraft.expression || '…'}</code>{' '}
                  <span className="draft-dir">{activeDraft.direction === 1 ? 'x →' : '← x'}</span>
                </>
              ) : view.options.preview === 'direction' ? (
                <span>is setting a function (direction shown)</span>
              ) : (
                <span>is typing…</span>
              )}
              {activeDraft.error && <span className="draft-error"> {activeDraft.error}</span>}
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
        {photoError && <div className="message inline error" role="status">{photoError}</div>}
        <span className="legal-copyright">© Leon Thiel, 2026</span>
        <a className="legal-notice-link" href="/impressum">Impressum &amp; Privacy Notice</a>
      </footer>

      {over && !animation && (
        <GameOverModal
          game={game}
          members={view.members}
          soloMode={view.soloMode}
          soloRounds={view.soloRounds}
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
