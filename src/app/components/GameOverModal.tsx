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
        <table className="stats-table" data-testid="shot-stats">
          <thead>
            <tr>
              <th>Player</th>
              <th>Successful shots</th>
              <th>Average accuracy</th>
            </tr>
          </thead>
          <tbody>
            {game.players.map((p) => {
              const member = members.find((m) => m.playerId === p.id);
              const stats = game.shotStats.find((s) => s.playerId === p.id);
              const shots = stats?.successfulShots ?? 0;
              return (
                <tr key={p.id}>
                  <td style={{ color: member?.color ?? p.color }}>{member?.name ?? p.name}</td>
                  <td>{shots}</td>
                  <td>{shots > 0 ? `${Math.round((stats?.accuracySum ?? 0) / shots)}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
