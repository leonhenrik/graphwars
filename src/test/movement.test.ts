import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/gameState';
import { movePlayersClockwise } from '../game/movement';

describe('clockwise player movement', () => {
  it('moves living players clockwise by a small step', () => {
    const state = createInitialState({ playerCount: 3, mapId: 'classic', seed: 1 });
    const moved = movePlayersClockwise(state, 0.5);
    const soldier = state.soldiers[0]!;
    const next = moved.soldiers[0]!;
    const centerX = (state.battlefield.bounds.minX + state.battlefield.bounds.maxX) / 2;
    const centerY = (state.battlefield.bounds.minY + state.battlefield.bounds.maxY) / 2;
    const before = Math.atan2(soldier.y - centerY, soldier.x - centerX);
    const after = Math.atan2(next.y - centerY, next.x - centerX);
    const clockwiseDelta = (before - after + Math.PI * 2) % (Math.PI * 2);

    expect(Math.hypot(next.x - soldier.x, next.y - soldier.y)).toBeCloseTo(0.5, 1);
    expect(clockwiseDelta).toBeGreaterThan(0);
    expect(clockwiseDelta).toBeLessThan(0.1);
  });

  it('keeps movement clear of obstacles and other living players', () => {
    const state = createInitialState({ playerCount: 4, mapId: 'classic', seed: 1 });
    const moved = movePlayersClockwise(state, 0.5);

    for (const soldier of moved.soldiers.filter((s) => s.alive)) {
      for (const obstacle of moved.battlefield.obstacles) {
        expect(Math.hypot(soldier.x - obstacle.x, soldier.y - obstacle.y)).toBeGreaterThanOrEqual(
          soldier.radius + obstacle.radius + 0.08 - 1e-8,
        );
      }
      for (const other of moved.soldiers.filter((s) => s.alive && s.id !== soldier.id)) {
        expect(Math.hypot(soldier.x - other.x, soldier.y - other.y)).toBeGreaterThanOrEqual(
          soldier.radius + other.radius - 1e-8,
        );
      }
    }
  });

  it('uses the configured movement distance', () => {
    const state = createInitialState({ playerCount: 3, mapId: 'classic', seed: 1 });
    const soldier = state.soldiers[0]!;
    const shortMove = movePlayersClockwise(state, 0.5).soldiers[0]!;
    const longMove = movePlayersClockwise(state, 1).soldiers[0]!;
    const shortDistance = Math.hypot(shortMove.x - soldier.x, shortMove.y - soldier.y);
    const longDistance = Math.hypot(longMove.x - soldier.x, longMove.y - soldier.y);

    expect(longDistance).toBeGreaterThan(shortDistance);
  });

  it('slides along an obstacle edge instead of walking through it', () => {
    const state = createInitialState({ playerCount: 4, mapId: 'classic', seed: 1 });
    const soldier = state.soldiers[0]!;
    const centerX = (state.battlefield.bounds.minX + state.battlefield.bounds.maxX) / 2;
    const centerY = (state.battlefield.bounds.minY + state.battlefield.bounds.maxY) / 2;
    const offsetX = soldier.x - centerX;
    const offsetY = soldier.y - centerY;
    const radius = Math.hypot(offsetX, offsetY);
    const tangent = { x: offsetY / radius, y: -offsetX / radius };
    const normal = { x: offsetX / radius, y: offsetY / radius };
    state.battlefield.obstacles = [{
      id: 'blocking-obstacle',
      x: soldier.x + tangent.x * 1.15 + normal.x * 0.4,
      y: soldier.y + tangent.y * 1.15 + normal.y * 0.4,
      radius: 0.2,
    }];
    const moved = movePlayersClockwise(state, 0.5).soldiers[0]!;

    expect(Math.hypot(moved.x - soldier.x, moved.y - soldier.y)).toBeGreaterThan(0.1);
    expect(Math.hypot(moved.x - soldier.x, moved.y - soldier.y)).toBeLessThanOrEqual(0.51);
    expect(Math.hypot(moved.x - state.battlefield.obstacles[0]!.x, moved.y - state.battlefield.obstacles[0]!.y))
      .toBeGreaterThanOrEqual(soldier.radius + state.battlefield.obstacles[0]!.radius + 0.08 - 1e-8);
  });

  it('does not move eliminated players or finished matches', () => {
    const state = createInitialState({ playerCount: 2, mapId: 'classic', seed: 1 });
    state.soldiers[0]!.alive = false;
    const moved = movePlayersClockwise(state, 0.5);
    expect(moved.soldiers[0]).toMatchObject({ x: state.soldiers[0]!.x, y: state.soldiers[0]!.y });
    state.status = 'over';
    expect(movePlayersClockwise(state, 0.5)).toBe(state);
  });
});
