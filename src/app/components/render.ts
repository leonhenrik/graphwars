import type { GameState, ShotDirection, TrajectoryPoint } from '../../game/types';

export interface Effect {
  id: number;
  kind: 'elimination' | 'impact';
  x: number;
  y: number;
  color: string;
  startedAt: number;
  /** Text that rises out of the explosion, e.g. a shot's accuracy. */
  label?: string;
}

export const EFFECT_DURATION_MS = 900;
export const LABEL_DURATION_MS = 1600;

export interface PathLine {
  points: TrajectoryPoint[];
  color: string;
}

export interface DirectionLine {
  start: TrajectoryPoint;
  end: TrajectoryPoint;
  color: string;
}

export interface Scene {
  state: GameState;
  /** The soldier whose position is the origin (0,0) of the axes, or null for plain world axes. */
  originId: string | null;
  /** Soldiers that currently have to act (pulsing ring). */
  activeIds: string[];
  /** Soldiers that already fired this round (simultaneous mode); shown with a green ring. */
  lockedIds: string[];
  direction: ShotDirection;
  /** Selfie URLs by player number; a soldier with a loaded photo shows it inside an outline in their colour. */
  photos: Record<number, string>;
  /** Faint dashed traces of the previous shot(s). */
  traces: PathLine[];
  previews: PathLine[];
  previewDirections?: DirectionLine[];
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

interface StrokeStyle {
  color: string;
  alpha: number;
  width: number;
  dash?: number[];
  glow?: number;
}

const imageCache = new Map<string, HTMLImageElement>();

/** Returns the image once it has loaded (starting the download on first use), otherwise null. */
function loadedImage(url: string): HTMLImageElement | null {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    imageCache.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function drawScene(ctx: CanvasRenderingContext2D, view: View, scene: Scene): void {
  const vb = scene.state.battlefield.bounds;
  const scale = view.width / (vb.maxX - vb.minX);
  const px = (x: number) => (x - vb.minX) * scale;
  const py = (y: number) => (vb.maxY - y) * scale;

  const origin = scene.state.soldiers.find((s) => s.id === scene.originId);
  const ox = origin ? origin.x : 0;
  const oy = origin ? origin.y : 0;
  const dir = scene.direction;
  // Local coordinate u (function x) = dir * (X - ox); local v (function y) = Y - oy.
  const worldX = (u: number) => ox + dir * u;

  ctx.save();
  ctx.clearRect(0, 0, view.width, view.height);

  const bg = ctx.createLinearGradient(0, 0, 0, view.height);
  bg.addColorStop(0, '#fbf5e6');
  bg.addColorStop(1, '#efe5cf');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, view.width, view.height);

  // Grid, aligned to integer steps of the local coordinate system.
  const maxU = Math.ceil(vb.maxX - vb.minX);
  for (let u = -maxU; u <= maxU; u++) {
    const x = worldX(u);
    if (x < vb.minX || x > vb.maxX) continue;
    ctx.strokeStyle = u % 5 === 0 ? 'rgba(77,112,132,0.22)' : 'rgba(77,112,132,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(x), 0);
    ctx.lineTo(px(x), view.height);
    ctx.stroke();
  }
  for (let v = Math.ceil(vb.minY - oy); v <= vb.maxY - oy; v++) {
    const y = oy + v;
    ctx.strokeStyle = v % 5 === 0 ? 'rgba(77,112,132,0.22)' : 'rgba(77,112,132,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, py(y));
    ctx.lineTo(view.width, py(y));
    ctx.stroke();
  }

  // Axes through the origin player
  const axisColor = origin ? scene.state.players.find((p) => p.id === origin.playerId)?.color ?? '#49483f' : '#49483f';
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
  ctx.fillStyle = 'rgba(67,65,56,0.82)';
  ctx.strokeStyle = 'rgba(67,65,56,0.62)';
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let u = -Math.floor(maxU / 5) * 5; u <= maxU; u += 5) {
    const x = worldX(u);
    if (u === 0 || x < vb.minX + 0.5 || x > vb.maxX - 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(px(x), py(oy) - 4);
    ctx.lineTo(px(x), py(oy) + 4);
    ctx.stroke();
    ctx.fillText(String(u), px(x), py(oy) + 6);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil((vb.minY - oy) / 5) * 5; v <= vb.maxY - oy; v += 5) {
    const y = oy + v;
    if (v === 0 || y < vb.minY + 0.5 || y > vb.maxY - 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(px(ox) - 4, py(y));
    ctx.lineTo(px(ox) + 4, py(y));
    ctx.stroke();
    ctx.fillText(String(v), px(ox) + 7, py(y));
  }

  // Obstacles
  for (const o of scene.state.battlefield.obstacles) {
    const r = o.radius * scale;
    const cx = px(o.x);
    const cy = py(o.y);
    ctx.save();
    sketchRockPath(ctx, cx, cy, r, o.x * 19.7 + o.y * 7.3);
    ctx.fillStyle = '#d2c6aa';
    ctx.fill();
    ctx.strokeStyle = '#655e50';
    ctx.lineWidth = Math.max(1.4, scale * 0.09);
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#786f5d';
    ctx.lineWidth = Math.max(0.8, scale * 0.045);
    sketchRockPath(ctx, cx + 0.8, cy - 0.7, r, o.x * 19.7 + o.y * 7.3);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    sketchRockPath(ctx, cx, cy, r, o.x * 19.7 + o.y * 7.3);
    ctx.clip();
    ctx.strokeStyle = 'rgba(98, 88, 69, 0.24)';
    ctx.lineWidth = Math.max(0.6, scale * 0.035);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.62 + i * r * 0.28, cy + r * 0.18);
      ctx.lineTo(cx - r * 0.16 + i * r * 0.28, cy - r * 0.24);
      ctx.stroke();
    }
    if ((o.damage ?? 0) > 0) {
      ctx.strokeStyle = 'rgba(65, 54, 40, 0.72)';
      ctx.lineWidth = Math.max(1, scale * 0.055);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.12, cy - r * 0.78);
      ctx.lineTo(cx - r * 0.28, cy - r * 0.28);
      ctx.lineTo(cx - r * 0.04, cy - r * 0.08);
      ctx.lineTo(cx - r * 0.35, cy + r * 0.3);
      ctx.moveTo(cx - r * 0.28, cy - r * 0.28);
      ctx.lineTo(cx + r * 0.1, cy - r * 0.42);
      ctx.moveTo(cx - r * 0.04, cy - r * 0.08);
      ctx.lineTo(cx + r * 0.34, cy + r * 0.16);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  const drawLine = (points: TrajectoryPoint[], style: StrokeStyle) => {
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.globalAlpha = style.alpha;
    ctx.lineWidth = style.width;
    ctx.lineJoin = 'round';
    ctx.setLineDash(style.dash ?? []);
    ctx.shadowColor = style.color;
    ctx.shadowBlur = style.glow ?? 0;
    ctx.save();
    ctx.globalAlpha = style.alpha * 0.14;
    ctx.lineWidth = style.width + 1.2;
    ctx.shadowBlur = 0;
    ctx.translate(0.65, -0.45);
    strokePath(ctx, points, px, py);
    ctx.restore();
    strokePath(ctx, points, px, py);
    ctx.restore();
  };

  // Faint dashed trace of the previous shot(s)
  for (const trace of scene.traces) {
    drawLine(trace.points, { color: trace.color, alpha: 0.38, width: 2, dash: [3, 7] });
  }

  // Preview trajectories
  for (const preview of scene.previews) {
    drawLine(preview.points, { color: preview.color, alpha: 0.75, width: 2, dash: [6, 6] });
  }

  for (const arrow of scene.previewDirections ?? []) {
    const startX = px(arrow.start.x);
    const startY = py(arrow.start.y);
    const endX = px(arrow.end.x);
    const endY = py(arrow.end.y);
    const angle = Math.atan2(endY - startY, endX - startX);
    const headLength = Math.max(6, Math.min(12, scale * 0.65));
    ctx.save();
    ctx.strokeStyle = arrow.color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = arrow.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.moveTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(endX, endY);
    ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
    ctx.restore();
  }

  // Animated shots
  for (const shot of scene.shots) {
    if (shot.points.length === 0) continue;
    drawPencilLine(ctx, shot.points, shot.color, px, py);
    const head = shot.points[shot.points.length - 1] as TrajectoryPoint;
    ctx.save();
    ctx.fillStyle = '#fff9e9';
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
      ctx.strokeStyle = 'rgba(88,82,69,0.55)';
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
      ctx.strokeStyle = '#bd8735';
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
      ctx.fillStyle = '#bd8735';
      ctx.beginPath();
      ctx.moveTo(ax + dir * 10, cy);
      ctx.lineTo(ax, cy - 6);
      ctx.lineTo(ax, cy + 6);
      ctx.closePath();
      ctx.fill();
    }
    if (scene.lockedIds.includes(s.id)) {
      ctx.strokeStyle = '#71865d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    const photoUrl = scene.photos[s.playerId];
    const photo = photoUrl ? loadedImage(photoUrl) : null;
    if (photo) {
      // Selfie fills the bubble; only the outline keeps the player's colour.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(photo, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      const outline = Math.max(3, r * 0.2);
      ctx.strokeStyle = color;
      ctx.lineWidth = outline;
      ctx.beginPath();
      ctx.arc(cx, cy, r - outline / 2, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = '#49483f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = '#302f29';
    ctx.font = `bold ${Math.max(10, r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.label, cx, cy + 0.5);
  }

  // Effects
  for (const e of scene.effects) {
    const t = (scene.now - e.startedAt) / EFFECT_DURATION_MS;
    const tl = (scene.now - e.startedAt) / LABEL_DURATION_MS;
    if (e.label && tl >= 0 && tl <= 1) drawLabel(ctx, e, tl, px(e.x), py(e.y), scale);
    if (t < 0 || t > 1) continue;
    const cx = px(e.x);
    const cy = py(e.y);
    const maxR = (e.kind === 'elimination' ? 3.2 : 1.6) * scale;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = e.kind === 'elimination' ? '#ad6547' : '#bd8735';
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

/** Text that flies up and fades out from an explosion. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  e: Effect,
  t: number,
  cx: number,
  cy: number,
  scale: number,
): void {
  const y = cy - 2.6 * scale - 4 * scale * easeOut(t);
  ctx.save();
  ctx.globalAlpha = 1 - t * t;
  ctx.font = `bold ${Math.max(14, 1.5 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(48, 47, 41, 0.72)';
  ctx.strokeText(e.label as string, cx, y);
  ctx.fillStyle = e.color;
  ctx.fillText(e.label as string, cx, y);
  ctx.restore();
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

function drawPencilLine(
  ctx: CanvasRenderingContext2D,
  points: TrajectoryPoint[],
  color: string,
  px: (x: number) => number,
  py: (y: number) => number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.78;
  ctx.lineWidth = 2.2;
  strokePath(ctx, points, px, py);

  ctx.globalAlpha = 0.27;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 2.5]);
  ctx.lineDashOffset = -1;
  ctx.translate(0.7, -0.55);
  strokePath(ctx, points, px, py);

  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([1, 3.5]);
  ctx.lineDashOffset = -2;
  ctx.translate(-1.25, 1.1);
  strokePath(ctx, points, px, py);
  ctx.restore();
}

function sketchRockPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, seed: number): void {
  const sides = 13;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const roughness = 1 + Math.sin(seed + i * 2.41) * 0.11 + Math.cos(seed * 0.7 + i * 1.73) * 0.06;
    const x = cx + Math.cos(angle) * radius * roughness;
    const y = cy + Math.sin(angle) * radius * roughness;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
