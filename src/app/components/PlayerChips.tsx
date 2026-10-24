import type { MemberView } from '../../shared/protocol';
import type { GameState } from '../../game/types';

export function PlayerChips({ members, game }: { members: MemberView[]; game: GameState | null }) {
  const living = members.filter((m) => m.alive).length;
  return (
    <div className="hud" aria-label="Players">
      <span className="hud-title">
        Alive <span data-testid="living-count">{living}/{members.length}</span>
      </span>
      {members.map((m) => {
        const active = game?.status === 'playing' && game.turn.currentPlayerId === m.playerId;
        return (
          <span
            key={m.playerId}
            className={`pill${active ? ' active' : ''}${m.alive ? '' : ' dead'}${m.connected ? '' : ' offline'}`}
            style={{ borderColor: active ? m.color : undefined }}
            title={`${m.name}${m.alive ? '' : ' (eliminated)'}${m.connected ? '' : ' (phone offline)'}`}
            data-testid={`player-${m.playerId}`}
          >
            <span className="dot small" style={{ background: m.alive ? m.color : '#475569' }} />P{m.playerId}
            {!m.connected && <span aria-hidden="true"> ⚠</span>}
          </span>
        );
      })}
    </div>
  );
}
