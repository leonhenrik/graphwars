import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameState, ShotResult, TrajectoryPoint } from '../../game/types';
import { drawScene, partialPath, pathLength, EFFECT_DURATION_MS, type Effect } from './render';

export interface ShotAnimation {
  id: number;
  shot: ShotResult;
  color: string;
}

interface Props {
  state: GameState;
  selectedId: string | null;
  preview: TrajectoryPoint[] | null;
  animation: ShotAnimation | null;
  effects: Effect[];
  onSoldierClick: (soldierId: string) => void;
  onAnimationComplete: (animationId: number) => void;
}

const UNITS_PER_SECOND = 32;

export function Battlefield({
  state,
  selectedId,
  preview,
  animation,
  effects,
  onSoldierClick,
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
  const latest = useRef({ state, selectedId, preview, effects, onAnimationComplete });
  latest.current = { state, selectedId, preview, effects, onAnimationComplete };

  const animRef = useRef<{ id: number; start: number; duration: number; shot: ShotResult; color: string; done: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (!animation) {
      animRef.current = null;
      return;
    }
    const length = pathLength(animation.shot.points);
    const duration = Math.min(2600, Math.max(800, (length / UNITS_PER_SECOND) * 1000));
    animRef.current = {
      id: animation.id,
      start: performance.now(),
      duration,
      shot: animation.shot,
      color: animation.color,
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

      let shotScene: { points: TrajectoryPoint[]; color: string } | null = null;
      const anim = animRef.current;
      let finished: number | null = null;
      if (anim && !anim.done) {
        const fraction = Math.min(1, (now - anim.start) / anim.duration);
        shotScene = { points: partialPath(anim.shot.points, fraction), color: anim.color };
        if (fraction >= 1) {
          anim.done = true;
          finished = anim.id;
        }
      }

      const liveEffects = cur.effects.filter((e) => now - e.startedAt <= EFFECT_DURATION_MS);
      drawScene(
        ctx,
        size,
        {
          state: cur.state,
          selectedId: cur.selectedId,
          preview: anim ? null : cur.preview,
          shot: shotScene,
          effects: liveEffects,
          now,
        },
      );

      if (finished !== null) cur.onAnimationComplete(finished);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const scale = rect.width / (bounds.maxX - bounds.minX);
      const wx = bounds.minX + (e.clientX - rect.left) / scale;
      const wy = bounds.maxY - (e.clientY - rect.top) / scale;
      let best: { id: string; d: number } | null = null;
      for (const s of state.soldiers) {
        const d = Math.hypot(s.x - wx, s.y - wy);
        if (d <= s.radius + 0.6 && (best === null || d < best.d)) best = { id: s.id, d };
      }
      if (best) onSoldierClick(best.id);
    },
    [bounds, state.soldiers, onSoldierClick],
  );

  return (
    <div className="battlefield-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="battlefield-canvas"
        style={{ width: size.width, height: size.height }}
        onClick={handleClick}
        aria-label="Battlefield"
        data-testid="battlefield"
      />
    </div>
  );
}
