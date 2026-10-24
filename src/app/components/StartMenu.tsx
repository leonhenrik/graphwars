import { useEffect, useRef } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../game/constants';
import { createInitialState } from '../../game/gameState';
import { MAPS } from '../../game/battlefieldGenerator';
import type { MapId, MatchConfig } from '../../game/types';
import { drawScene } from './render';

interface Props {
  config: MatchConfig;
  onChange: (config: MatchConfig) => void;
  onStart: (config: MatchConfig) => void;
}

const THUMB_W = 220;
const THUMB_H = 132;

function MapThumbnail({ config }: { config: MatchConfig }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = THUMB_W * dpr;
    canvas.height = THUMB_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(
      ctx,
      { width: THUMB_W, height: THUMB_H },
      {
        state: createInitialState(config),
        activeId: null,
        direction: 1,
        preview: null,
        shot: null,
        effects: [],
        now: 0,
      },
    );
  }, [config]);
  return <canvas ref={ref} className="thumb" style={{ width: THUMB_W, height: THUMB_H }} aria-hidden="true" />;
}

export function StartMenu({ config, onChange, onStart }: Props) {
  const counts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

  return (
    <div className="menu" data-testid="start-menu">
      <div className="menu-card">
        <h1>Graphwars</h1>
        <p className="menu-sub">Hot-seat artillery with math. One blob per player — last one standing wins.</p>

        <h2>Players</h2>
        <div className="segmented" role="radiogroup" aria-label="Number of players">
          {counts.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={config.playerCount === n}
              className={`seg${config.playerCount === n ? ' selected' : ''}`}
              onClick={() => onChange({ ...config, playerCount: n })}
            >
              {n}
            </button>
          ))}
        </div>

        <h2>Map</h2>
        <div className="maps" role="radiogroup" aria-label="Map">
          {MAPS.map((map) => {
            const selected = config.mapId === map.id;
            const thumbConfig: MatchConfig = { ...config, mapId: map.id as MapId };
            return (
              <button
                key={map.id}
                role="radio"
                aria-checked={selected}
                className={`map-card${selected ? ' selected' : ''}`}
                onClick={() => onChange(thumbConfig)}
              >
                <MapThumbnail config={thumbConfig} />
                <span className="map-name">{map.name}</span>
                <span className="map-desc">{map.description}</span>
              </button>
            );
          })}
        </div>
        {config.mapId === 'scatter' && (
          <button
            className="btn shuffle"
            onClick={() => onChange({ ...config, seed: Math.floor(Math.random() * 1_000_000) })}
          >
            🎲 New random layout (seed {config.seed})
          </button>
        )}

        <button className="btn primary start" onClick={() => onStart(config)} data-testid="start-button">
          Start match
        </button>
      </div>
    </div>
  );
}
