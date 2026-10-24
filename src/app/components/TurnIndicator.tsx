import type { GameState } from '../../game/types';

export function TurnIndicator({ game, busy }: { game: GameState; busy: boolean }) {
  const player = game.players.find((p) => p.id === game.turn.currentPlayerId) ?? game.players[0];
  const over = game.status === 'over';
  if (!player) return null;
  const sub = over ? 'Match over' : busy ? 'Shot in flight…' : `Turn ${game.turn.turnNumber}`;
  return (
    <div className="turn-indicator" style={{ borderColor: over ? undefined : player.color }} data-testid="turn-indicator">
      <span className="dot" style={{ background: over ? '#94a3b8' : player.color }} />
      <span className="turn-label" data-testid="match-status">
        {over ? 'Match over' : `${player.name}'s turn`}
      </span>
      <span className="turn-sub">{over ? '' : sub}</span>
    </div>
  );
}
