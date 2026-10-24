import type { GameState, ShotDirection, TrajectoryPoint } from '../../game/types';

export interface Effect {
  id: number;
  kind: 'elimination' | 'impact';
  x: number;
  y: number;
  color: string;
  startedAt: number;
}

export const EFFECT_DURATION_MS = 900;

export interface PathLine {
  points: TrajectoryPoint[];
  color: string;
}

export interface Scene {
  state: GameState;
  /** The soldier whose position is the origin (0,0) of the axes, or null for plain world axes. */
  originId: string | null;
  /** Soldiers that currently have to act (pulsing ring). */
  activeIds: string[];
  /** Soldiers that already fired this round (simultaneous mode); shown with a check mark. */
  lockedIds: string[];
  direction: ShotDirection;
  previews: PathLine[];
  /** Shots being animated, already trimmed to the portion revealed so far. */
  shots: PathLine[];
  effects: Effect[];
  now: number;
}

export interface View {
  width: number;
  height: number;
}

/** Returns the first `fraction` (0..1) of the polyline by arc length. */
export function partialPath(points: TrajectoryPoint[], fraction: number): TrajectoryPoint[] {
  if (points.length < 2 || fraction >= 1) return points;
  if (fraction <= 0) return points.slice(0, 1);
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as TrajectoryPoint;
    const b = points[i] as TrajectoryPoint;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(d);
    total += d;
  }
  let remaining = total * fraction;
  const out: TrajectoryPoint[] = [points[0] as TrajectoryPoint];
  for (let i = 1; i < points.length; i++) {
    const seg = lengths[i - 1] as number;
    const a = points[i - 1] as TrajectoryPoint;
    const b = points[i] as TrajectoryPoint;
    if (remaining >= seg) {
      out.push(b);
      remaining -= seg;
    } else {
      const t = seg === 0 ? 0 : remaining / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      break;
    }
  }
  return out;
}

export function pathLength(points: TrajectoryPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as TrajectoryPoint;
    const b = points[i] as TrajectoryPoint;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export function drawScene(ctx: CanvasRenderingContext2D, view: View, scene: Scene): void {
  const { bounds } = scene.state.battlefield;
  const scale = view.width / (bounds.maxX - bounds.minX);
  const px = (x: number) => (x - bounds.minX) * scale;
  const py = (y: number) => (bounds.maxY - y) * scale;

  const active = scene.state.soldiers.find((s) => s.id === scene.originId);
  const ox = active ? active.x : 0;
  const oy = active ? active.y : 0;
  const dir = scene.direction;
  // Local coordinate u (function x) = dir * (X - ox); local v (function y) = Y - oy.
  const worldX = (u: number) => ox + dir * u;

  ctx.save();
  ctx.clearRect(0, 0, view.width, view.height);

  const bg = ctx.createLinearGradient(0, 0, 0, view.height);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#111c33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, view.width, view.height);

  // Grid, aligned to integer steps of the local coordinate system.
  const maxU = Math.ceil(bounds.maxX - bounds.minX);
  for (let u = -maxU; u <= maxU; u++) {
    const x = worldX(u);
    if (x < bounds.minX || x > bounds.maxX) continue;
    ctx.strokeStyle = u % 5 === 0 ? 'rgba(148,163,184,0.20)' : 'rgba(148,163,184,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(x), 0);
    ctx.lineTo(px(x), view.height);
    ctx.stroke();
  }
  for (let v = Math.ceil(bounds.minY - oy); v <= bounds.maxY - oy; v++) {
    const y = oy + v;
    ctx.strokeStyle = v % 5 === 0 ? 'rgba(148,163,184,0.20)' : 'rgba(148,163,184,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, py(y));
    ctx.lineTo(view.width, py(y));
    ctx.stroke();
  }

  // Axes through the active player
  const axisColor = active ? scene.state.players.find((p) => p.id === active.playerId)?.color ?? '#e2e8f0' : '#e2e8f0';
  ctx.strokeStyle = axisColor;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, py(oy));
  ctx.lineTo(view.width, py(oy));
  ctx.moveTo(px(ox), 0);
  ctx.lineTo(px(ox), view.height);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Ticks and labels in local coordinates (positive x points in the shooting direction)
  const fontSize = Math.max(9, Math.min(12, scale * 0.6));
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(203,213,225,0.8)';
  ctx.strokeStyle = 'rgba(226,232,240,0.7)';
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let u = -Math.floor(maxU / 5) * 5; u <= maxU; u += 5) {
    const x = worldX(u);
    if (u === 0 || x < bounds.minX + 0.5 || x > bounds.maxX - 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(px(x), py(oy) - 4);
    ctx.lineTo(px(x), py(oy) + 4);
    ctx.stroke();
    ctx.fillText(String(u), px(x), py(oy) + 6);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil((bounds.minY - oy) / 5) * 5; v <= bounds.maxY - oy; v += 5) {
    const y = oy + v;
    if (v === 0 || y < bounds.minY + 0.5 || y > bounds.maxY - 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(px(ox) - 4, py(y));
    ctx.lineTo(px(ox) + 4, py(y));
    ctx.stroke();
    ctx.fillText(String(v), px(ox) + 7, py(y));
  }

  // Obstacles
  for (const o of scene.state.battlefield.obstacles) {
    const r = o.radius * scale;
    const g = ctx.createRadialGradient(px(o.x) - r * 0.3, py(o.y) - r * 0.3, r * 0.1, px(o.x), py(o.y), r);
    g.addColorStop(0, '#64748b');
    g.addColorStop(1, '#334155');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(o.x), py(o.y), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Preview trajectories
  for (const preview of scene.previews) {
    if (preview.points.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = preview.color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    strokePath(ctx, preview.points, px, py);
    ctx.restore();
  }

  // Animated shots
  for (const shot of scene.shots) {
    if (shot.points.length === 0) continue;
    const pts = shot.points;
    ctx.save();
    ctx.shadowColor = shot.color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = shot.color;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    strokePath(ctx, pts, px, py);
    const head = pts[pts.length - 1] as TrajectoryPoint;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px(head.x), py(head.y), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Soldiers
  for (const s of scene.state.soldiers) {
    const color = scene.state.players.find((p) => p.id === s.playerId)?.color ?? '#fff';
    const cx = px(s.x);
    const cy = py(s.y);
    const r = s.radius * scale;
    if (!s.alive) {
      ctx.strokeStyle = 'rgba(148,163,184,0.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r * 0.7);
      ctx.lineTo(cx + r * 0.7, cy + r * 0.7);
      ctx.moveTo(cx + r * 0.7, cy - r * 0.7);
      ctx.lineTo(cx - r * 0.7, cy + r * 0.7);
      ctx.stroke();
      continue;
    }
    if (scene.activeIds.includes(s.id)) {
      const pulse = 0.5 + 0.5 * Math.sin(scene.now / 220);
      ctx.strokeStyle = '#fde047';
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (s.id === scene.originId) {
      // Direction arrow
      const ax = cx + dir * (r + 12);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(ax + dir * 10, cy);
      ctx.lineTo(ax, cy - 6);
      ctx.lineTo(ax, cy + 6);
      ctx.closePath();
      ctx.fill();
    }
    if (scene.lockedIds.includes(s.id)) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0b1220';
    ctx.font = `bold ${Math.max(10, r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.label, cx, cy + 0.5);
  }

  // Effects
  for (const e of scene.effects) {
    const t = (scene.now - e.startedAt) / EFFECT_DURATION_MS;
    if (t < 0 || t > 1) continue;
    const cx = px(e.x);
    const cy = py(e.y);
    const maxR = (e.kind === 'elimination' ? 3.2 : 1.6) * scale;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = e.kind === 'elimination' ? '#f87171' : '#fde68a';
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * easeOut(t), 0, Math.PI * 2);
    ctx.stroke();
    const sparks = e.kind === 'elimination' ? 10 : 6;
    ctx.fillStyle = e.color;
    for (let i = 0; i < sparks; i++) {
      const ang = (i / sparks) * Math.PI * 2 + 0.4;
      const d = maxR * 0.8 * easeOut(t);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, 3 * (1 - t) + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  points: TrajectoryPoint[],
  px: (x: number) => number,
  py: (y: number) => number,
): void {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.x), py(p.y)) : ctx.lineTo(px(p.x), py(p.y))));
  ctx.stroke();
}
