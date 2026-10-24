import type { GameState } from '../../game/types';

export function GameHUD({ game }: { game: GameState }) {
  const living = game.soldiers.filter((s) => s.alive).length;
  return (
    <section className="panel-section" aria-label="Players">
      <h2>
        Players <span data-testid="living-count">{living}/{game.players.length}</span> alive
      </h2>
      <div className="teams">
        {game.players.map((player) => {
          const alive = game.soldiers.some((s) => s.playerId === player.id && s.alive);
          const active = game.status === 'playing' && game.turn.currentPlayerId === player.id;
          return (
            <div
              key={player.id}
              className={`team-card${active ? ' active' : ''}${alive ? '' : ' dead'}`}
              style={{ borderColor: active ? player.color : undefined }}
              data-testid={`player-${player.id}`}
            >
              <span className="dot" style={{ background: alive ? player.color : '#475569' }} />
              <span className="team-name">{player.name}</span>
              <span className="team-count">{alive ? 'alive' : 'out'}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
