import { useCallback, useMemo, useRef, useState } from 'react';
import type { Effect } from '../app/components/render';
import type { ShotAnimation } from '../app/components/Battlefield';
import { createInitialState, getLivingSoldiers, getSoldier, restartGame } from '../game/gameState';
import { applyShot, buildTrajectory, simulateShot } from '../game/simulation';
import { describeTrajectoryEnd } from '../game/trajectory';
import { canSelectSoldier, markFired } from '../game/turnManager';
import type { GameState, PlayerId, ShotResult, TrajectoryPoint } from '../game/types';

export type MessageKind = 'info' | 'success' | 'warning' | 'error';
export interface Message {
  kind: MessageKind;
  text: string;
}

export const DEFAULT_EXPRESSION = 'sin(x)';

function firstLivingId(state: GameState): string | null {
  return getLivingSoldiers(state, state.turn.currentPlayerId)[0]?.id ?? null;
}

function describeShot(state: GameState, shot: ShotResult): Message {
  const shooter = getSoldier(state, shot.shooterId);
  const shooterPlayer = shooter ? state.players[shooter.playerId].name : 'Player';
  if (shot.outcome === 'hit-soldier') {
    const target = getSoldier(state, shot.targetId);
    if (target && shooter && target.playerId === shooter.playerId) {
      return {
        kind: 'warning',
        text: `Friendly fire! ${shooterPlayer} eliminated their own soldier ${target.label}.`,
      };
    }
    const label = target ? ` ${target.label}` : '';
    return { kind: 'success', text: `${shooterPlayer} eliminated enemy soldier${label}!` };
  }
  if (shot.outcome === 'hit-obstacle') return { kind: 'info', text: 'The shot was blocked by an obstacle.' };
  return { kind: 'info', text: `Miss — the shot ${describeTrajectoryEnd(shot.end)}.` };
}

export function useGame() {
  const [game, setGame] = useState<GameState>(createInitialState);
  const [selectedId, setSelectedId] = useState<string | null>(() => firstLivingId(createInitialState()));
  const [expression, setExpression] = useState(DEFAULT_EXPRESSION);
  const [animation, setAnimation] = useState<ShotAnimation | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [passEnabled, setPassEnabled] = useState(true);
  const [passScreenFor, setPassScreenFor] = useState<PlayerId | null>(null);
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const nextAnimationId = useRef(1);
  const nextEffectId = useRef(1);

  const selected = getSoldier(game, selectedId);
  const isAnimating = animation !== null;
  const turnLocked = isAnimating || passScreenFor !== null || game.status === 'over';

  const trajectory = useMemo(() => {
    if (!selectedId || game.status === 'over' || game.turn.hasFired) return null;
    return buildTrajectory(game, selectedId, expression);
  }, [game, selectedId, expression]);

  const previewPoints: TrajectoryPoint[] | null = trajectory?.ok ? trajectory.trajectory.points : null;
  const expressionError = trajectory && !trajectory.ok ? trajectory.error : null;
  const canFire = !turnLocked && !game.turn.hasFired && selected !== undefined && trajectory?.ok === true;

  const selectSoldier = useCallback(
    (id: string) => {
      if (isAnimating) return setMessage({ kind: 'warning', text: 'Wait for the shot to finish.' });
      if (passScreenFor !== null || game.status === 'over') return;
      const soldier = getSoldier(game, id);
      if (!soldier) return;
      if (!soldier.alive) return setMessage({ kind: 'error', text: `Soldier ${soldier.label} has been eliminated.` });
      if (!canSelectSoldier(game, soldier)) {
        return setMessage({
          kind: 'error',
          text: `That's ${game.players[soldier.playerId].name}'s soldier. Pick one of yours.`,
        });
      }
      setSelectedId(id);
      setMessage(null);
    },
    [game, isAnimating, passScreenFor],
  );

  const preview = useCallback(() => {
    if (!selected) return setMessage({ kind: 'error', text: 'Select one of your soldiers first.' });
    if (!trajectory) return;
    if (!trajectory.ok) return setMessage({ kind: 'error', text: trajectory.error });
    setMessage({
      kind: 'info',
      text: `Preview: the curve passes through soldier ${selected.label} and ${describeTrajectoryEnd(trajectory.trajectory.end)}. Obstacles and soldiers are not considered until you fire.`,
    });
  }, [selected, trajectory]);

  const fire = useCallback(() => {
    if (isAnimating) return setMessage({ kind: 'warning', text: 'A shot is already in flight.' });
    if (passScreenFor !== null) return setMessage({ kind: 'warning', text: 'Press Continue first.' });
    const result = simulateShot(game, selectedId ?? '', expression);
    if (!result.ok) return setMessage({ kind: 'error', text: result.error });

    const shooter = getSoldier(game, result.shot.shooterId);
    setGame(markFired(game));
    setMessage({ kind: 'info', text: 'Firing…' });
    setAnimation({
      id: nextAnimationId.current++,
      shot: result.shot,
      color: shooter ? game.players[shooter.playerId].color : '#fff',
    });
  }, [game, selectedId, expression, isAnimating, passScreenFor]);

  const completeShot = useCallback(
    (animationId: number) => {
      if (!animation || animation.id !== animationId) return;
      const { shot } = animation;
      const next = applyShot(game, shot);
      const now = performance.now();

      const added: Effect[] = [];
      if (shot.outcome === 'hit-soldier') {
        const target = getSoldier(game, shot.targetId);
        if (target) {
          added.push({
            id: nextEffectId.current++,
            kind: 'elimination',
            x: target.x,
            y: target.y,
            color: game.players[target.playerId].color,
            startedAt: now,
          });
        }
      } else if (shot.outcome === 'hit-obstacle' && shot.impact) {
        added.push({
          id: nextEffectId.current++,
          kind: 'impact',
          x: shot.impact.x,
          y: shot.impact.y,
          color: animation.color,
          startedAt: now,
        });
      }
      setEffects((prev) => [...prev.filter((e) => now - e.startedAt < 1000), ...added]);

      const base = describeShot(game, shot);
      if (next.status === 'over') {
        const winner = next.winnerId ? next.players[next.winnerId].name : 'Nobody';
        setMessage({ kind: 'success', text: `${base.text} ${winner} wins!` });
      } else {
        setMessage(base);
      }

      setGame(next);
      setAnimation(null);
      setSelectedId(next.status === 'over' ? null : firstLivingId(next));
      setPassScreenFor(next.status === 'playing' && passEnabled ? next.turn.currentPlayerId : null);
    },
    [animation, game, passEnabled],
  );

  const continueFromPass = useCallback(() => setPassScreenFor(null), []);

  const resetEverything = useCallback(() => {
    const fresh = restartGame();
    setGame(fresh);
    setSelectedId(firstLivingId(fresh));
    setExpression(DEFAULT_EXPRESSION);
    setAnimation(null);
    setEffects([]);
    setMessage(null);
    setPassScreenFor(null);
    setConfirmingRestart(false);
  }, []);

  const requestRestart = useCallback(() => {
    if (game.status === 'playing') setConfirmingRestart(true);
    else resetEverything();
  }, [game.status, resetEverything]);

  const cancelRestart = useCallback(() => setConfirmingRestart(false), []);

  return {
    game,
    selectedId,
    selected,
    expression,
    setExpression,
    previewPoints,
    expressionError,
    animation,
    effects,
    message,
    passEnabled,
    setPassEnabled,
    passScreenFor,
    confirmingRestart,
    isAnimating,
    canFire,
    selectSoldier,
    preview,
    fire,
    completeShot,
    continueFromPass,
    requestRestart,
    confirmRestart: resetEverything,
    playAgain: resetEverything,
    cancelRestart,
  };
}

export type GameController = ReturnType<typeof useGame>;
