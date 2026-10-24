import type { GameState, TrajectoryPoint } from '../../game/types';

export interface Effect {
  id: number;
  kind: 'elimination' | 'impact';
  x: number;
  y: number;
  color: string;
  startedAt: number;
}

export const EFFECT_DURATION_MS = 900;

export interface Scene {
  state: GameState;
  selectedId: string | null;
  preview: TrajectoryPoint[] | null;
  /** The shot being animated, already trimmed to the portion revealed so far. */
  shot: { points: TrajectoryPoint[]; color: string } | null;
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

  ctx.save();
  ctx.clearRect(0, 0, view.width, view.height);

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, view.height);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#111c33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, view.width, view.height);

  // Grid
  for (let x = Math.ceil(bounds.minX); x <= bounds.maxX; x++) {
    ctx.strokeStyle = x % 5 === 0 ? 'rgba(148,163,184,0.20)' : 'rgba(148,163,184,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(x), 0);
    ctx.lineTo(px(x), view.height);
    ctx.stroke();
  }
  for (let y = Math.ceil(bounds.minY); y <= bounds.maxY; y++) {
    ctx.strokeStyle = y % 5 === 0 ? 'rgba(148,163,184,0.20)' : 'rgba(148,163,184,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, py(y));
    ctx.lineTo(view.width, py(y));
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = 'rgba(226,232,240,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, py(0));
  ctx.lineTo(view.width, py(0));
  ctx.moveTo(px(0), 0);
  ctx.lineTo(px(0), view.height);
  ctx.stroke();

  // Ticks and labels
  const fontSize = Math.max(9, Math.min(12, scale * 0.6));
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(203,213,225,0.75)';
  ctx.strokeStyle = 'rgba(226,232,240,0.7)';
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let x = Math.ceil(bounds.minX / 5) * 5; x <= bounds.maxX; x += 5) {
    ctx.beginPath();
    ctx.moveTo(px(x), py(0) - 4);
    ctx.lineTo(px(x), py(0) + 4);
    ctx.stroke();
    if (x !== 0) ctx.fillText(String(x), px(x), py(0) + 6);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let y = Math.ceil(bounds.minY / 5) * 5; y <= bounds.maxY; y += 5) {
    ctx.beginPath();
    ctx.moveTo(px(0) - 4, py(y));
    ctx.lineTo(px(0) + 4, py(y));
    ctx.stroke();
    if (y !== 0) ctx.fillText(String(y), px(0) + 7, py(y));
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

  // Preview trajectory
  const selected = scene.state.soldiers.find((s) => s.id === scene.selectedId);
  if (scene.preview && scene.preview.length > 1 && selected) {
    ctx.save();
    ctx.strokeStyle = scene.state.players[selected.playerId].color;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    strokePath(ctx, scene.preview, px, py);
    ctx.restore();
  }

  // Animated shot
  if (scene.shot && scene.shot.points.length > 0) {
    const pts = scene.shot.points;
    ctx.save();
    ctx.shadowColor = scene.shot.color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = scene.shot.color;
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
    const color = scene.state.players[s.playerId].color;
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
    if (s.id === scene.selectedId) {
      const pulse = 0.5 + 0.5 * Math.sin(scene.now / 220);
      ctx.strokeStyle = '#fde047';
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
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
