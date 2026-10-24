import type { GameState } from '../../game/types';

export function GameHUD({ game }: { game: GameState }) {
  const living = game.soldiers.filter((s) => s.alive).length;
  return (
    <div className="hud" aria-label="Players">
      <span className="hud-title">
        Alive <span data-testid="living-count">{living}/{game.players.length}</span>
      </span>
      {game.players.map((player) => {
        const alive = game.soldiers.some((s) => s.playerId === player.id && s.alive);
        const active = game.status === 'playing' && game.turn.currentPlayerId === player.id;
        return (
          <span
            key={player.id}
            className={`pill${active ? ' active' : ''}${alive ? '' : ' dead'}`}
            style={{ borderColor: active ? player.color : undefined }}
            title={`${player.name}${alive ? '' : ' (eliminated)'}`}
            data-testid={`player-${player.id}`}
          >
            <span className="dot small" style={{ background: alive ? player.color : '#475569' }} />P{player.id}
          </span>
        );
      })}
    </div>
  );
}
