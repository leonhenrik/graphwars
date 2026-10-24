import type { GameState } from '../../game/types';
import type { MemberView } from '../../shared/protocol';

export function GameOverModal({
  game,
  members,
  onPlayAgain,
  onLobby,
}: {
  game: GameState;
  members: MemberView[];
  onPlayAgain: () => void;
  onLobby: () => void;
}) {
  const winner = members.find((m) => m.playerId === game.winnerId);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title" data-testid="game-over">
      <div className="modal">
        <h2 id="gameover-title" style={{ color: winner?.color }}>
          {winner ? `${winner.name} wins!` : 'Draw'}
        </h2>
        <p>The last player standing takes the match.</p>
        <div className="button-row">
          <button className="btn" onClick={onLobby}>
            Back to lobby
          </button>
          <button className="btn primary" onClick={onPlayAgain} autoFocus>
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
