import { getLivingSoldiers } from '../../game/gameState';
import type { GameState, PlayerId, Soldier } from '../../game/types';

interface Props {
  game: GameState;
  selected: Soldier | undefined;
}

export function GameHUD({ game, selected }: Props) {
  return (
    <section className="panel-section" aria-label="Teams">
      <h2>Teams</h2>
      <div className="teams">
        {([1, 2] as PlayerId[]).map((id) => {
          const player = game.players[id];
          const living = getLivingSoldiers(game, id).length;
          const total = game.soldiers.filter((s) => s.playerId === id).length;
          const active = game.status === 'playing' && game.turn.currentPlayerId === id;
          return (
            <div
              key={id}
              className={`team-card${active ? ' active' : ''}`}
              style={{ borderColor: active ? player.color : undefined }}
              data-testid={`team-${id}`}
            >
              <span className="dot" style={{ background: player.color }} />
              <span className="team-name">{player.name}</span>
              <span className="team-count" data-testid={`living-${id}`}>
                {living}/{total}
              </span>
            </div>
          );
        })}
      </div>
      <div className="selected-info" data-testid="selected-info">
        {selected ? (
          <>
            Shooter: <strong>Soldier {selected.label}</strong> at ({selected.x}, {selected.y}) · fires{' '}
            {game.players[selected.playerId].direction === 1 ? 'right →' : '← left'}
          </>
        ) : (
          'No soldier selected. Click one of your soldiers on the battlefield.'
        )}
      </div>
    </section>
  );
}
