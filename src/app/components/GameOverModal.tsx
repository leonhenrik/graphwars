import type { GameState } from '../../game/types';

export function GameOverModal({ game, onPlayAgain }: { game: GameState; onPlayAgain: () => void }) {
  const winner = game.winnerId ? game.players[game.winnerId] : null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title" data-testid="game-over">
      <div className="modal">
        <h2 id="gameover-title" style={{ color: winner?.color }}>
          {winner ? `${winner.name} wins!` : 'Draw'}
        </h2>
        <p>All enemy soldiers have been eliminated.</p>
        <button className="btn primary" onClick={onPlayAgain} autoFocus>
          Play Again
        </button>
      </div>
    </div>
  );
}
