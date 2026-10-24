import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../game/constants';
import { createInitialState } from '../../game/gameState';
import { MAPS } from '../../game/battlefieldGenerator';
import type { MapId, MatchConfig } from '../../game/types';
import type { MemberView } from '../../shared/protocol';
import { drawScene } from './render';

interface Props {
  members: MemberView[];
  mapId: MapId;
  seed: number;
  /** Addresses phones can use to reach this server, e.g. http://192.168.1.20:3000/play */
  joinUrls: string[];
  onConfigure: (mapId: MapId, seed: number) => void;
  onStart: () => void;
  notice: string | null;
}

const THUMB_W = 220;
const THUMB_H = 132;

function MapThumbnail({ config }: { config: MatchConfig }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useMemo(() => createInitialState(config), [config.playerCount, config.mapId, config.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = THUMB_W * dpr;
    canvas.height = THUMB_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, { width: THUMB_W, height: THUMB_H }, {
      state,
      activeId: null,
      direction: 1,
      preview: null,
      shot: null,
      effects: [],
      now: 0,
    });
  }, [state]);
  return <canvas ref={ref} className="thumb" style={{ width: THUMB_W, height: THUMB_H }} aria-hidden="true" />;
}

function JoinCard({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  const url = urls[index];
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 200, color: { dark: '#0b1220', light: '#ffffff' } })
      .then((data) => !cancelled && setQr(data))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) {
    return (
      <div className="join-card">
        <p className="menu-sub">No network address found. Connect this laptop to wifi so phones can join.</p>
      </div>
    );
  }
  return (
    <div className="join-card" data-testid="join-card">
      {qr && <img className="qr" src={qr} alt={`QR code for ${url}`} width={160} height={160} />}
      <div>
        <div className="join-steps">Join with your phone (same wifi)</div>
        <div className="join-url" data-testid="join-url">{url}</div>
        {urls.length > 1 && (
          <div className="join-alt">
            Other addresses:{' '}
            {urls.map((u, i) =>
              i === index ? null : (
                <button key={u} className="link" onClick={() => setIndex(i)}>
                  {u}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Lobby({ members, mapId, seed, joinUrls, onConfigure, onStart, notice }: Props) {
  const thumbPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, members.length));
  const canStart = members.length >= MIN_PLAYERS;

  return (
    <div className="menu" data-testid="lobby">
      <div className="menu-card">
        <h1>Graphwars</h1>
        <p className="menu-sub">Everyone joins with their phone. Phones are the calculators, this screen is the battlefield.</p>

        <JoinCard urls={joinUrls} />

        <h2>
          Players joined <span data-testid="player-count">{members.length}</span>/{MAX_PLAYERS}
        </h2>
        <div className="joined" data-testid="joined-players">
          {members.length === 0 && <span className="menu-sub">Waiting for the first phone…</span>}
          {members.map((m) => (
            <span key={m.playerId} className="pill big" style={{ borderColor: m.color }}>
              <span className="dot small" style={{ background: m.color }} />
              {m.name}
            </span>
          ))}
        </div>

        <h2>Map</h2>
        <div className="maps" role="radiogroup" aria-label="Map">
          {MAPS.map((map) => {
            const selected = mapId === map.id;
            return (
              <button
                key={map.id}
                role="radio"
                aria-checked={selected}
                className={`map-card${selected ? ' selected' : ''}`}
                onClick={() => onConfigure(map.id, seed)}
              >
                <MapThumbnail config={{ playerCount: thumbPlayers, mapId: map.id, seed }} />
                <span className="map-name">{map.name}</span>
                <span className="map-desc">{map.description}</span>
              </button>
            );
          })}
        </div>
        {mapId === 'scatter' && (
          <button className="btn shuffle" onClick={() => onConfigure(mapId, Math.floor(Math.random() * 1_000_000))}>
            🎲 New random layout (seed {seed})
          </button>
        )}

        {notice && <div className="message error" role="status">{notice}</div>}
        <button className="btn primary start" onClick={onStart} disabled={!canStart} data-testid="start-button">
          {canStart ? `Start match with ${members.length} players` : `Need at least ${MIN_PLAYERS} players`}
        </button>
      </div>
    </div>
  );
}
