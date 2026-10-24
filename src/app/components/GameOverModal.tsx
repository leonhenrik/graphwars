import type { GameState } from '../../game/types';

export function GameOverModal({
  game,
  onPlayAgain,
  onMenu,
}: {
  game: GameState;
  onPlayAgain: () => void;
  onMenu: () => void;
}) {
  const winner = game.players.find((p) => p.id === game.winnerId);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title" data-testid="game-over">
      <div className="modal">
        <h2 id="gameover-title" style={{ color: winner?.color }}>
          {winner ? `${winner.name} wins!` : 'Draw'}
        </h2>
        <p>The last player standing takes the match.</p>
        <div className="button-row">
          <button className="btn" onClick={onMenu}>
            Main menu
          </button>
          <button className="btn primary" onClick={onPlayAgain} autoFocus>
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
