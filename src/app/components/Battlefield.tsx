import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameState, ShotDirection } from '../../game/types';
import type { FiredShot } from '../../shared/protocol';
import { drawScene, partialPath, pathLength, EFFECT_DURATION_MS, type Effect, type PathLine } from './render';

/** One or more shots that are animated together (several when players fire simultaneously). */
export interface ShotAnimation {
  id: number;
  shots: FiredShot[];
}

interface Props {
  state: GameState;
  originId: string | null;
  activeIds: string[];
  lockedIds: string[];
  direction: ShotDirection;
  previews: PathLine[];
  /** Faint dashed traces of the previous shot(s), shown until the next shot is fired. */
  traces: PathLine[];
  animation: ShotAnimation | null;
  effects: Effect[];
  onAnimationComplete: (animationId: number) => void;
}

/** Shot speed in battlefield units per second, and the min/max time a shot takes (slow enough to follow). */
const UNITS_PER_SECOND = 18;
const MIN_SHOT_MS = 1500;
const MAX_SHOT_MS = 5000;

export function Battlefield({
  state,
  originId,
  activeIds,
  lockedIds,
  direction,
  previews,
  traces,
  animation,
  effects,
  onAnimationComplete,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const { bounds } = state.battlefield;
  const aspect = (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w <= 0 || h <= 0) return;
      const width = Math.floor(Math.min(w, h * aspect));
      setSize((prev) => {
        const height = Math.floor(width / aspect);
        return prev.width === width && prev.height === height ? prev : { width, height };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [aspect]);

  // The render loop reads the latest props via a ref so it never needs restarting.
  const latest = useRef({ state, originId, activeIds, lockedIds, direction, previews, traces, effects, onAnimationComplete });
  latest.current = { state, originId, activeIds, lockedIds, direction, previews, traces, effects, onAnimationComplete };

  const animRef = useRef<{
    id: number;
    start: number;
    shots: Array<{ shot: FiredShot; durationMs: number }>;
    done: boolean;
  } | null>(null);
  useEffect(() => {
    if (!animation) {
      animRef.current = null;
      return;
    }
    animRef.current = {
      id: animation.id,
      start: performance.now(),
      shots: animation.shots.map((shot) => ({
        shot,
        durationMs: Math.min(MAX_SHOT_MS, Math.max(MIN_SHOT_MS, (pathLength(shot.shot.points) / UNITS_PER_SECOND) * 1000)),
      })),
      done: false,
    };
  }, [animation]);

  useEffect(() => {
    if (size.width === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const frame = (now: number) => {
      const cur = latest.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let shotLines: PathLine[] = [];
      const anim = animRef.current;
      let finished: number | null = null;
      if (anim && !anim.done) {
        let allDone = true;
        shotLines = anim.shots.map(({ shot, durationMs }) => {
          const fraction = Math.min(1, (now - anim.start) / durationMs);
          if (fraction < 1) allDone = false;
          return { points: partialPath(shot.shot.points, fraction), color: shot.color };
        });
        if (allDone) {
          anim.done = true;
          finished = anim.id;
        }
      }

      const liveEffects = cur.effects.filter((e) => now - e.startedAt <= EFFECT_DURATION_MS);
      drawScene(ctx, size, {
        state: cur.state,
        originId: cur.originId,
        activeIds: cur.activeIds,
        lockedIds: cur.lockedIds,
        direction: cur.direction,
        previews: anim ? [] : cur.previews,
        traces: anim ? [] : cur.traces,
        shots: shotLines,
        effects: liveEffects,
        now,
      });

      if (finished !== null) cur.onAnimationComplete(finished);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div className="battlefield-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="battlefield-canvas"
        style={{ width: size.width, height: size.height }}
        aria-label="Battlefield"
        data-testid="battlefield"
      />
    </div>
  );
}
