import type { GameState, GameOptions } from '../../game/types';

interface Props {
  game: GameState;
  options: GameOptions;
  busy: boolean;
  /** Simultaneous mode: how many players have fired in this round. */
  firedCount: number;
}

export function TurnIndicator({ game, options, busy, firedCount }: Props) {
  const over = game.status === 'over';
  const simultaneous = options.shotMode === 'simultaneous';
  const living = game.soldiers.filter((s) => s.alive).length;
  const player = game.players.find((p) => p.id === game.turn.currentPlayerId) ?? game.players[0];
  if (!player) return null;

  let label: string;
  let sub: string;
  if (over) {
    label = 'Match over';
    sub = '';
  } else if (simultaneous) {
    label = `Round ${game.turn.turnNumber}`;
    sub = busy ? 'Shots in flight…' : `${firedCount}/${living} fired`;
  } else {
    label = `${player.name}'s turn`;
    sub = busy ? 'Shot in flight…' : `Turn ${game.turn.turnNumber}`;
  }
  const color = over ? '#94a3b8' : simultaneous ? '#e2e8f0' : player.color;

  return (
    <div className="turn-indicator" style={{ borderColor: over ? undefined : color }} data-testid="turn-indicator">
      <span className="dot" style={{ background: color }} />
      <span className="turn-label" data-testid="match-status">
        {label}
      </span>
      <span className="turn-sub">{sub}</span>
    </div>
  );
}
