// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGame } from '../hooks/useGame';

describe('useGame – local match flow', () => {
  it('starts with player 1 and an auto-selected soldier', () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.game.turn.currentPlayerId).toBe(1);
    expect(result.current.selectedId).toBe('p1-s1');
    expect(result.current.canFire).toBe(true);
    expect(result.current.previewPoints?.length).toBeGreaterThan(1);
  });

  it('rejects selecting enemy or eliminated soldiers with feedback', () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.selectSoldier('p2-s1'));
    expect(result.current.selectedId).toBe('p1-s1');
    expect(result.current.message?.kind).toBe('error');

    act(() => result.current.selectSoldier('p1-s2'));
    expect(result.current.selectedId).toBe('p1-s2');
  });

  it('disables firing for invalid expressions', () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.setExpression('sin('));
    expect(result.current.canFire).toBe(false);
    expect(result.current.expressionError).toBeTruthy();
    act(() => result.current.fire());
    expect(result.current.animation).toBeNull();
    expect(result.current.message?.kind).toBe('error');
  });

  it('fires once, locks input during the animation, then passes the turn', () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.setExpression('0'));
    act(() => result.current.fire());

    const anim = result.current.animation;
    expect(anim).not.toBeNull();
    expect(result.current.canFire).toBe(false);
    expect(result.current.game.turn.currentPlayerId).toBe(1);

    // A second fire during the animation is ignored.
    act(() => result.current.fire());
    expect(result.current.animation?.id).toBe(anim!.id);

    act(() => result.current.completeShot(anim!.id));
    expect(result.current.animation).toBeNull();
    expect(result.current.game.turn.currentPlayerId).toBe(2);
    expect(result.current.selectedId).toBe('p2-s1');
    expect(result.current.passScreenFor).toBe(2);
    expect(result.current.canFire).toBe(false);

    act(() => result.current.continueFromPass());
    expect(result.current.canFire).toBe(true);
  });

  it('ignores stale animation completions', () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.completeShot(999));
    expect(result.current.game.turn.turnNumber).toBe(1);
  });

  it('skips the pass screen when disabled', () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.setPassEnabled(false));
    act(() => result.current.fire());
    act(() => result.current.completeShot(result.current.animation!.id));
    expect(result.current.passScreenFor).toBeNull();
    expect(result.current.canFire).toBe(true);
  });

  it('plays a match to the end: hits eliminate enemies, win is detected, restart is clean', () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.setPassEnabled(false));

    const play = (soldierId: string | null, expr: string) => {
      if (soldierId) act(() => result.current.selectSoldier(soldierId));
      act(() => result.current.setExpression(expr));
      act(() => result.current.fire());
      act(() => result.current.completeShot(result.current.animation!.id));
    };
    const alive = (id: string) => result.current.game.soldiers.find((s) => s.id === id)!.alive;

    // Curves are chosen to arc around the default obstacles and land on the mirrored enemy soldier.
    play('p1-s3', 'x^2*0.008');
    expect(alive('p2-s3')).toBe(false);
    expect(result.current.message?.text).toMatch(/eliminated enemy/);
    expect(result.current.effects.length).toBe(1);
    expect(result.current.game.turn.currentPlayerId).toBe(2);

    // Restart asks for confirmation during an active match.
    act(() => result.current.requestRestart());
    expect(result.current.confirmingRestart).toBe(true);
    act(() => result.current.cancelRestart());
    expect(alive('p2-s3')).toBe(false);

    // Player 2's flat shot is stopped by an obstacle.
    play(null, '0');
    expect(result.current.message?.text).toMatch(/obstacle/);
    expect(result.current.game.soldiers.filter((s) => s.alive)).toHaveLength(5);

    play('p1-s2', 'x^2*0.015');
    expect(alive('p2-s2')).toBe(false);
    play(null, '0');
    play('p1-s1', '-x^2*0.01');

    expect(alive('p2-s1')).toBe(false);
    expect(result.current.game.status).toBe('over');
    expect(result.current.game.winnerId).toBe(1);
    expect(result.current.canFire).toBe(false);
    expect(result.current.message?.text).toMatch(/Player 1 wins/);

    // Restart (via Play Again) leaves no stale state.
    act(() => result.current.playAgain());
    expect(result.current.game.soldiers.every((s) => s.alive)).toBe(true);
    expect(result.current.game.status).toBe('playing');
    expect(result.current.game.winnerId).toBeNull();
    expect(result.current.game.turn).toEqual({ currentPlayerId: 1, turnNumber: 1, hasFired: false });
    expect(result.current.selectedId).toBe('p1-s1');
    expect(result.current.message).toBeNull();
    expect(result.current.animation).toBeNull();
    expect(result.current.effects).toHaveLength(0);
    expect(result.current.confirmingRestart).toBe(false);
  });
});
