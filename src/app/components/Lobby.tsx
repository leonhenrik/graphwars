import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_MOVEMENT_MAX_DISTANCE,
  PLAYER_MOVEMENT_MIN_DISTANCE,
  PLAYER_MOVEMENT_STEP,
} from '../../game/constants';
import { createInitialState } from '../../game/gameState';
import { MAPS } from '../../game/battlefieldGenerator';
import type { GameOptions, MapId, MatchConfig } from '../../game/types';
import type { MemberView } from '../../shared/protocol';
import { drawScene } from './render';
import { Avatar } from './Avatar';
import { BackgroundCurves } from './BackgroundCurves';
import { BrandMark } from './BrandMark';

interface Props {
  members: MemberView[];
  mapId: MapId;
  seed: number;
  options: GameOptions;
  /** Addresses phones can use to reach this server, e.g. http://192.168.1.20:3000/play */
  joinUrls: string[];
  onConfigure: (mapId: MapId, seed: number, options: GameOptions) => void;
  onStart: () => void;
  notice: string | null;
}

const THUMB_W = 220;
const THUMB_H = 132;

function MapThumbnail({ config }: { config: MatchConfig }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { playerCount, mapId, seed } = config;
  const state = useMemo(() => createInitialState({ playerCount, mapId, seed }), [playerCount, mapId, seed]);
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
      originId: null,
      activeIds: [],
      lockedIds: [],
      direction: 1,
      photos: {},
      traces: [],
      previews: [],
      previewDirections: [],
      shots: [],
      effects: [],
      now: 0,
    });
  }, [state]);
  return <canvas ref={ref} className="thumb" aria-hidden="true" />;
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
    QRCode.toDataURL(url, { margin: 1, width: 960, color: { dark: '#0b1220', light: '#ffffff' } })
      .then((data) => !cancelled && setQr(data))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) {
    return <p className="menu-sub">No network address found. Connect this laptop to wifi so phones can join.</p>;
  }
  return (
    <div className="join-card" data-testid="join-card">
      {qr && <img className="qr" src={qr} alt={`QR code for ${url}`} />}
      <div className="join-text">
        <div className="join-steps">Scan with your phone camera, or open</div>
        <div className="join-url" data-testid="join-url">{url}</div>
        <div className="join-alt">Phones must be on the same wifi.</div>
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

function Panel({ title, step, children, className = '' }: { title: string; step?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <h2>
        {step && <span className="step">{step}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  choices,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  choices: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  testId: string;
}) {
  return (
    <div className="rule" data-testid={testId}>
      <div className="rule-head">
        <span className="rule-label">{label}</span>
        <div className="segmented" role="radiogroup" aria-label={label}>
          {choices.map((c) => (
            <button
              key={c.value}
              role="radio"
              aria-checked={value === c.value}
              className={`seg${value === c.value ? ' selected' : ''}`}
              onClick={() => onChange(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Lobby({ members, mapId, seed, options, joinUrls, onConfigure, onStart, notice }: Props) {
  // Phones that dropped (e.g. while the camera app is open) keep their seat for a while but do not count yet.
  const online = members.filter((m) => m.connected).length;
  const thumbPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, online));
  const canStart = online >= MIN_PLAYERS;
  const update = (patch: Partial<GameOptions>) => onConfigure(mapId, seed, { ...options, ...patch });

  return (
    <div className="lobby-page" data-testid="lobby">
      <BackgroundCurves />
      <div className="lobby-shell">

        <div className="lobby-grid">
          <header className="lobby-brand">
            <div className="brand-lockup">
              <BrandMark />
              <h1 className="brand">
                Graph<span>wars</span>
              </h1>
            </div>
            <p className="menu-sub">Phones are the calculators, this screen is the battlefield.</p>
          </header>

          <div className="lobby-col">
            <Panel title="Join with your phone" step="1">
              <JoinCard urls={joinUrls} />
            </Panel>

            <Panel title={`Players ${members.length}/${MAX_PLAYERS}`} step="2">
              <div className="joined" data-testid="joined-players">
                {members.length === 0 && <span className="menu-sub">Waiting for the first phone…</span>}
                {members.map((m) => (
                  <span
                    key={m.playerId}
                    className={`avatar${m.connected ? '' : ' offline'}`}
                    style={{ ['--c' as string]: m.color }}
                    title={m.connected ? undefined : 'Phone disconnected'}
                  >
                    <Avatar member={m} size={60}>
                      {m.playerId}
                    </Avatar>
                    {m.name}
                    {!m.connected && <span aria-hidden="true"> ⚠</span>}
                  </span>
                ))}
              </div>
              <span hidden data-testid="player-count">{online}</span>
              <button className="btn primary start" onClick={onStart} disabled={!canStart} data-testid="start-button">
                {canStart ? `Start match with ${online} players` : `Waiting for players (need ${MIN_PLAYERS})`}
              </button>
            </Panel>
          </div>

          <div className="lobby-col">
            <Panel title="Rules" step="3">
              <Segmented
                testId="rule-mode"
                label="Shot order"
                value={options.shotMode}
                choices={[
                  { value: 'turns', label: 'One after another' },
                  { value: 'simultaneous', label: 'All at once' },
                ]}
                onChange={(shotMode) => update({ shotMode })}
              />
              <Segmented
                testId="rule-preview"
                label="Trajectory preview"
                value={options.preview}
                choices={[
                  { value: 'off', label: 'Off' },
                  { value: 'curve', label: 'Curve' },
                  { value: 'direction', label: 'Direction' },
                ]}
                onChange={(preview) => update({ preview })}
              />
              <Segmented
                testId="rule-player-movement"
                label="Player Movement"
                value={options.playerMovement ? 'on' : 'off'}
                choices={[
                  { value: 'off', label: 'Off' },
                  { value: 'on', label: 'On' },
                ]}
                onChange={(v) => update({ playerMovement: v === 'on' })}
              />
              <div className={`slider-row${options.playerMovement ? '' : ' disabled'}`}>
                <input
                  type="range"
                  min={PLAYER_MOVEMENT_MIN_DISTANCE}
                  max={PLAYER_MOVEMENT_MAX_DISTANCE}
                  step={PLAYER_MOVEMENT_STEP}
                  value={options.playerMovementDistance}
                  disabled={!options.playerMovement}
                  aria-label="Player movement distance"
                  data-testid="player-movement-distance"
                  onChange={(e) => update({ playerMovementDistance: Number(e.target.value) })}
                />
                <span className="slider-value">{options.playerMovementDistance.toFixed(1)}</span>
              </div>
              <Segmented
                testId="rule-countdown"
                label="Countdown"
                value={options.countdownEnabled ? 'on' : 'off'}
                choices={[
                  { value: 'off', label: 'Off' },
                  { value: 'on', label: 'On' },
                ]}
                onChange={(v) => update({ countdownEnabled: v === 'on' })}
              />
              <div className={`slider-row${options.countdownEnabled ? '' : ' disabled'}`}>
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={Math.min(120, options.countdownSeconds)}
                  disabled={!options.countdownEnabled}
                  aria-label="Countdown seconds"
                  data-testid="countdown-seconds"
                  onChange={(e) => update({ countdownSeconds: Number(e.target.value) })}
                />
                <span className="slider-value">{options.countdownSeconds}s</span>
              </div>
            </Panel>

            <Panel title="Map" step="4" className="maps-panel">
              <div className="maps" role="radiogroup" aria-label="Map">
                {MAPS.map((map) => {
                  const selected = mapId === map.id;
                  const regenerable = map.id === 'scatter' || map.id === 'chaos';
                  return (
                    <div key={map.id} className="map-slot">
                      <button
                        role="radio"
                        aria-checked={selected}
                        className={`map-card${selected ? ' selected' : ''}`}
                        onClick={() => onConfigure(map.id, seed, options)}
                      >
                        <MapThumbnail config={{ playerCount: thumbPlayers, mapId: map.id, seed }} />
                        <span className="map-name">{map.name}</span>
                        <span className="map-desc">{map.description}</span>
                      </button>
                      {selected && regenerable && (
                        <button
                          className="map-regen"
                          title={`New random layout (seed ${seed})`}
                          aria-label="New random layout"
                          onClick={() => onConfigure(mapId, Math.floor(Math.random() * 1_000_000), options)}
                        >
                          ↻
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>

        {notice && <div className="message error" role="status">{notice}</div>}
      </div>
    </div>
  );
}
