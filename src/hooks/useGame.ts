import { useCallback, useMemo, useRef, useState } from 'react';
import type { Effect } from '../app/components/render';
import type { ShotAnimation } from '../app/components/Battlefield';
import {
  createInitialState,
  DEFAULT_CONFIG,
  defaultDirection,
  getPlayer,
  getPlayerSoldier,
  getSoldier,
  restartGame,
} from '../game/gameState';
import { applyShot, buildTrajectory, simulateShot } from '../game/simulation';
import { describeTrajectoryEnd } from '../game/trajectory';
import { getActiveSoldierId, markFired } from '../game/turnManager';
import type { GameState, MatchConfig, PlayerId, ShotDirection, ShotResult, TrajectoryPoint } from '../game/types';

export type MessageKind = 'info' | 'success' | 'warning' | 'error';
export interface Message {
  kind: MessageKind;
  text: string;
}

export const DEFAULT_EXPRESSION = 'sin(x)';

function describeShot(state: GameState, shot: ShotResult): Message {
  const shooter = getSoldier(state, shot.shooterId);
  const shooterName = shooter ? getPlayer(state, shooter.playerId).name : 'Player';
  if (shot.outcome === 'hit-soldier') {
    const target = getSoldier(state, shot.targetId);
    const targetName = target ? getPlayer(state, target.playerId).name : 'a player';
    return { kind: 'success', text: `${shooterName} eliminated ${targetName}!` };
  }
  if (shot.outcome === 'hit-obstacle') return { kind: 'info', text: `${shooterName}'s shot was blocked by an obstacle.` };
  return { kind: 'info', text: `${shooterName} missed — the shot ${describeTrajectoryEnd(shot.end)}.` };
}

export function useGame() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [game, setGame] = useState<GameState>(() => createInitialState(DEFAULT_CONFIG));
  const [expression, setExpression] = useState(DEFAULT_EXPRESSION);
  const [direction, setDirection] = useState<ShotDirection>(1);
  const [animation, setAnimation] = useState<ShotAnimation | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [passEnabled, setPassEnabled] = useState(true);
  const [passScreenFor, setPassScreenFor] = useState<PlayerId | null>(null);
  const [confirm, setConfirm] = useState<'restart' | 'menu' | null>(null);
  const nextAnimationId = useRef(1);
  const nextEffectId = useRef(1);

  const activeId = game.status === 'over' ? null : getActiveSoldierId(game);
  const active = getSoldier(game, activeId);
  const isAnimating = animation !== null;
  const turnLocked = isAnimating || passScreenFor !== null || game.status === 'over';

  const trajectory = useMemo(() => {
    if (!activeId || game.status === 'over' || game.turn.hasFired) return null;
    return buildTrajectory(game, activeId, expression, direction);
  }, [game, activeId, expression, direction]);

  const previewPoints: TrajectoryPoint[] | null = trajectory?.ok ? trajectory.trajectory.points : null;
  const expressionError = trajectory && !trajectory.ok ? trajectory.error : null;
  const canFire = !turnLocked && !game.turn.hasFired && active !== undefined && trajectory?.ok === true;

  const beginMatch = useCallback((state: GameState) => {
    const first = getPlayerSoldier(state, state.turn.currentPlayerId);
    setGame(state);
    setDirection(first ? defaultDirection(first) : 1);
    setExpression(DEFAULT_EXPRESSION);
    setAnimation(null);
    setEffects([]);
    setMessage(null);
    setPassScreenFor(null);
    setConfirm(null);
    setScreen('game');
  }, []);

  const startMatch = useCallback((config: MatchConfig) => beginMatch(createInitialState(config)), [beginMatch]);

  const clickSoldier = useCallback(
    (id: string) => {
      const soldier = getSoldier(game, id);
      if (!soldier || isAnimating || passScreenFor !== null || game.status === 'over') return;
      if (!soldier.alive) return setMessage({ kind: 'error', text: `${getPlayer(game, soldier.playerId).name} has been eliminated.` });
      if (soldier.id !== activeId) {
        return setMessage({
          kind: 'error',
          text: `That's ${getPlayer(game, soldier.playerId).name}. It's ${getPlayer(game, game.turn.currentPlayerId).name}'s turn.`,
        });
      }
      setMessage({ kind: 'info', text: 'You are the origin (0, 0) of the graph. Enter a function and fire!' });
    },
    [game, isAnimating, passScreenFor, activeId],
  );

  const toggleDirection = useCallback(() => {
    if (turnLocked) return;
    setDirection((d) => (d === 1 ? -1 : 1));
  }, [turnLocked]);

  const preview = useCallback(() => {
    if (!active) return setMessage({ kind: 'error', text: 'No active shooter.' });
    if (!trajectory) return;
    if (!trajectory.ok) return setMessage({ kind: 'error', text: trajectory.error });
    setMessage({
      kind: 'info',
      text: `Preview: the curve starts at you and ${describeTrajectoryEnd(trajectory.trajectory.end)}. Obstacles and players are only considered when you fire.`,
    });
  }, [active, trajectory]);

  const fire = useCallback(() => {
    if (isAnimating) return setMessage({ kind: 'warning', text: 'A shot is already in flight.' });
    if (passScreenFor !== null) return setMessage({ kind: 'warning', text: 'Press Continue first.' });
    const result = simulateShot(game, activeId ?? '', expression, direction);
    if (!result.ok) return setMessage({ kind: 'error', text: result.error });

    const shooter = getSoldier(game, result.shot.shooterId);
    setGame(markFired(game));
    setMessage({ kind: 'info', text: 'Firing…' });
    setAnimation({
      id: nextAnimationId.current++,
      shot: result.shot,
      color: shooter ? getPlayer(game, shooter.playerId).color : '#fff',
    });
  }, [game, activeId, expression, direction, isAnimating, passScreenFor]);

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
            color: getPlayer(game, target.playerId).color,
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
        const winner = next.winnerId !== null ? getPlayer(next, next.winnerId).name : 'Nobody';
        setMessage({ kind: 'success', text: `${base.text} ${winner} wins!` });
      } else {
        setMessage(base);
      }

      setGame(next);
      setAnimation(null);
      const nextSoldier = getPlayerSoldier(next, next.turn.currentPlayerId);
      if (next.status === 'playing' && nextSoldier) setDirection(defaultDirection(nextSoldier));
      setPassScreenFor(next.status === 'playing' && passEnabled ? next.turn.currentPlayerId : null);
    },
    [animation, game, passEnabled],
  );

  const continueFromPass = useCallback(() => setPassScreenFor(null), []);

  const restartNow = useCallback(() => beginMatch(restartGame(game)), [beginMatch, game]);

  const goToMenu = useCallback(() => {
    setAnimation(null);
    setPassScreenFor(null);
    setConfirm(null);
    setScreen('menu');
  }, []);

  const requestRestart = useCallback(() => {
    if (game.status === 'playing') setConfirm('restart');
    else restartNow();
  }, [game.status, restartNow]);

  const requestMenu = useCallback(() => {
    if (game.status === 'playing') setConfirm('menu');
    else goToMenu();
  }, [game.status, goToMenu]);

  const cancelConfirm = useCallback(() => setConfirm(null), []);

  return {
    screen,
    game,
    active,
    activeId,
    direction,
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
    confirm,
    isAnimating,
    turnLocked,
    canFire,
    startMatch,
    clickSoldier,
    toggleDirection,
    preview,
    fire,
    completeShot,
    continueFromPass,
    requestRestart,
    requestMenu,
    confirmAction: confirm === 'menu' ? goToMenu : restartNow,
    cancelConfirm,
    playAgain: restartNow,
    goToMenu,
  };
}

export type GameController = ReturnType<typeof useGame>;
