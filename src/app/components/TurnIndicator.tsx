import type { GameState } from '../../game/types';

export function TurnIndicator({ game, busy }: { game: GameState; busy: boolean }) {
  const player = game.players[game.turn.currentPlayerId];
  const over = game.status === 'over';
  return (
    <div className="turn-indicator" style={{ borderColor: player.color }} data-testid="turn-indicator">
      <span className="dot" style={{ background: over ? '#94a3b8' : player.color }} />
      <div>
        <div className="turn-label">{over ? 'Match over' : `${player.name}'s turn`}</div>
        <div className="turn-sub">
          {over ? 'Press Play Again to start a new match' : busy ? 'Shot in flight…' : `Turn ${game.turn.turnNumber}`}
        </div>
      </div>
    </div>
  );
}
