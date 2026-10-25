import type { GameState, Obstacle, Soldier, TrajectoryPoint } from './types';

const MOVE_SUBSTEP = 0.04;
const EDGE_GAP = 0.08;

function distanceToSegment(point: TrajectoryPoint, start: TrajectoryPoint, end: TrajectoryPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function blockedByObstacle(start: TrajectoryPoint, end: TrajectoryPoint, soldier: Soldier, obstacles: Obstacle[]) {
  return obstacles.find(
    (o) =>
      distanceToSegment(o, start, end) < o.radius + soldier.radius + EDGE_GAP,
  );
}

function clearOfSoldiers(
  start: TrajectoryPoint,
  end: TrajectoryPoint,
  soldier: Soldier,
  others: Soldier[],
): boolean {
  return others.every(
    (other) =>
      distanceToSegment({ x: other.x, y: other.y }, start, end) >= soldier.radius + other.radius,
  );
}

function inBounds(point: TrajectoryPoint, soldier: Soldier, state: GameState): boolean {
  const { bounds } = state.battlefield;
  return (
    point.x >= bounds.minX + soldier.radius &&
    point.x <= bounds.maxX - soldier.radius &&
    point.y >= bounds.minY + soldier.radius &&
    point.y <= bounds.maxY - soldier.radius
  );
}

function clearStep(
  start: TrajectoryPoint,
  end: TrajectoryPoint,
  soldier: Soldier,
  others: Soldier[],
  state: GameState,
): boolean {
  return (
    inBounds(end, soldier, state) &&
    !blockedByObstacle(start, end, soldier, state.battlefield.obstacles) &&
    clearOfSoldiers(start, end, soldier, others)
  );
}

function moveSoldier(soldier: Soldier, others: Soldier[], state: GameState, moveDistance: number): TrajectoryPoint {
  const { bounds } = state.battlefield;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const offsetX = soldier.x - centerX;
  const offsetY = soldier.y - centerY;
  const radius = Math.hypot(offsetX, offsetY);
  if (radius < MOVE_SUBSTEP) return { x: soldier.x, y: soldier.y };

  let current = { x: soldier.x, y: soldier.y };
  const startAngle = Math.atan2(offsetY, offsetX);
  let travelled = 0;
  let sliding: Obstacle | null = null;

  while (travelled < moveDistance) {
    const step = Math.min(MOVE_SUBSTEP, moveDistance - travelled);
    const progress = travelled + step;
    const angle = startAngle - progress / radius;
    const desired = { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) };

    if (sliding && clearStep(current, desired, soldier, others, state)) sliding = null;

    if (sliding) {
      const nx = current.x - sliding.x;
      const ny = current.y - sliding.y;
      const normalLength = Math.hypot(nx, ny);
      if (normalLength > 0) {
        const normalX = nx / normalLength;
        const normalY = ny / normalLength;
        const tangentA = { x: -normalY, y: normalX };
        const tangentB = { x: normalY, y: -normalX };
        const desiredX = desired.x - current.x;
        const desiredY = desired.y - current.y;
        const tangent = tangentA.x * desiredX + tangentA.y * desiredY >= tangentB.x * desiredX + tangentB.y * desiredY
          ? tangentA
          : tangentB;
        const slideTo = { x: current.x + tangent.x * step, y: current.y + tangent.y * step };
        if (clearStep(current, slideTo, soldier, others, state)) {
          current = slideTo;
          travelled += step;
          continue;
        }
      }
      break;
    }

    if (clearStep(current, desired, soldier, others, state)) {
      current = desired;
      travelled += step;
      continue;
    }

    const obstacle = blockedByObstacle(current, desired, soldier, state.battlefield.obstacles);
    if (!obstacle) break;
    sliding = obstacle;
  }

  return current;
}

/** Moves each living player clockwise around the field centre, sliding along blocked obstacle edges. */
export function movePlayersClockwise(state: GameState, moveDistance: number): GameState {
  if (state.status !== 'playing') return state;
  if (!Number.isFinite(moveDistance) || moveDistance <= 0) return state;

  const soldiers = state.soldiers.map((soldier) => ({ ...soldier }));
  for (let i = 0; i < soldiers.length; i++) {
    const soldier = soldiers[i] as Soldier;
    if (!soldier.alive) continue;
    const others = soldiers.filter((other, index) => index !== i && other.alive);
    const next = moveSoldier(soldier, others, state, moveDistance);
    soldier.x = next.x;
    soldier.y = next.y;
  }

  return { ...state, soldiers };
}
