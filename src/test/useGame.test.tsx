// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGame } from '../hooks/useGame';
import type { MatchConfig } from '../game/types';

const DUEL: MatchConfig = { playerCount: 2, mapId: 'classic', seed: 1 };

function start(config: MatchConfig = DUEL) {
  const hook = renderHook(() => useGame());
  act(() => hook.result.current.startMatch(config));
  return hook;
}

describe('useGame – local match flow', () => {
  it('begins on the menu and starts a match with the chosen settings', () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.screen).toBe('menu');
    act(() => result.current.startMatch({ playerCount: 4, mapId: 'pillars', seed: 3 }));
    expect(result.current.screen).toBe('game');
    expect(result.current.game.players).toHaveLength(4);
    expect(result.current.game.config.mapId).toBe('pillars');
    expect(result.current.activeId).toBe('p1');
    expect(result.current.canFire).toBe(true);
    expect(result.current.previewPoints?.length).toBeGreaterThan(1);
  });

  it('defaults the direction towards the middle and lets the player flip it', () => {
    const { result } = start();
    expect(result.current.direction).toBe(1);
    const before = result.current.previewPoints!;
    act(() => result.current.toggleDirection());
    expect(result.current.direction).toBe(-1);
    expect(result.current.previewPoints).not.toEqual(before);
    act(() => result.current.toggleDirection());
    expect(result.current.direction).toBe(1);
  });

  it('gives feedback when clicking another player, and never changes the shooter', () => {
    const { result } = start();
    act(() => result.current.clickSoldier('p2'));
    expect(result.current.activeId).toBe('p1');
    expect(result.current.message?.kind).toBe('error');
  });

  it('disables firing for invalid expressions', () => {
    const { result } = start();
    act(() => result.current.setExpression('sin('));
    expect(result.current.canFire).toBe(false);
    expect(result.current.expressionError).toBeTruthy();
    act(() => result.current.fire());
    expect(result.current.animation).toBeNull();
    expect(result.current.message?.kind).toBe('error');
  });

  it('fires once, locks input during the animation, then passes the turn with a new default direction', () => {
    const { result } = start();
    act(() => result.current.setExpression('0'));
    act(() => result.current.fire());

    const anim = result.current.animation;
    expect(anim).not.toBeNull();
    expect(result.current.canFire).toBe(false);
    expect(result.current.game.turn.currentPlayerId).toBe(1);

    act(() => result.current.fire());
    act(() => result.current.toggleDirection());
    expect(result.current.animation?.id).toBe(anim!.id);
    expect(result.current.direction).toBe(1);

    act(() => result.current.completeShot(anim!.id));
    expect(result.current.animation).toBeNull();
    expect(result.current.game.turn.currentPlayerId).toBe(2);
    expect(result.current.activeId).toBe('p2');
    expect(result.current.direction).toBe(-1);
    expect(result.current.passScreenFor).toBe(2);
    expect(result.current.canFire).toBe(false);

    act(() => result.current.continueFromPass());
    expect(result.current.canFire).toBe(true);
  });

  it('ignores stale animation completions', () => {
    const { result } = start();
    act(() => result.current.completeShot(999));
    expect(result.current.game.turn.turnNumber).toBe(1);
  });

  it('skips the pass screen when disabled', () => {
    const { result } = start();
    act(() => result.current.setPassEnabled(false));
    act(() => result.current.fire());
    act(() => result.current.completeShot(result.current.animation!.id));
    expect(result.current.passScreenFor).toBeNull();
    expect(result.current.canFire).toBe(true);
  });

  it('plays a duel to the end, then restarts and returns to the menu without stale state', () => {
    const { result } = start();
    act(() => result.current.setPassEnabled(false));

    // Player 1 sits at (-21, 0) and player 2 at (21, 0); the parabola arcs over the central rock.
    act(() => result.current.setExpression('0.012*x*(42-x)'));
    expect(result.current.canFire).toBe(true);
    act(() => result.current.fire());
    act(() => result.current.completeShot(result.current.animation!.id));

    expect(result.current.game.soldiers.find((s) => s.id === 'p2')!.alive).toBe(false);
    expect(result.current.game.status).toBe('over');
    expect(result.current.game.winnerId).toBe(1);
    expect(result.current.canFire).toBe(false);
    expect(result.current.message?.text).toMatch(/Player 1 wins/);
    expect(result.current.effects).toHaveLength(1);

    act(() => result.current.playAgain());
    expect(result.current.screen).toBe('game');
    expect(result.current.game.soldiers.every((s) => s.alive)).toBe(true);
    expect(result.current.game.status).toBe('playing');
    expect(result.current.game.winnerId).toBeNull();
    expect(result.current.game.turn).toEqual({ currentPlayerId: 1, turnNumber: 1, hasFired: false });
    expect(result.current.message).toBeNull();
    expect(result.current.animation).toBeNull();
    expect(result.current.effects).toHaveLength(0);
    expect(result.current.expression).toBe('sin(x)');

    act(() => result.current.goToMenu());
    expect(result.current.screen).toBe('menu');
  });

  it('asks for confirmation before restarting or leaving an active match', () => {
    const { result } = start();
    act(() => result.current.requestRestart());
    expect(result.current.confirm).toBe('restart');
    act(() => result.current.cancelConfirm());
    expect(result.current.confirm).toBeNull();
    expect(result.current.screen).toBe('game');

    act(() => result.current.requestMenu());
    expect(result.current.confirm).toBe('menu');
    act(() => result.current.confirmAction());
    expect(result.current.screen).toBe('menu');
    expect(result.current.confirm).toBeNull();
  });

  it('a blocked shot hits an obstacle and passes the turn to the next living player', () => {
    const { result } = start({ playerCount: 3, mapId: 'classic', seed: 1 });
    act(() => result.current.setPassEnabled(false));
    act(() => result.current.setExpression('0'));
    act(() => result.current.fire());
    act(() => result.current.completeShot(result.current.animation!.id));
    expect(result.current.game.soldiers.every((s) => s.alive)).toBe(true);
    expect(result.current.game.turn.currentPlayerId).toBe(2);
  });
});
