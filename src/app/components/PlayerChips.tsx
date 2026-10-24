import type { MemberView } from '../../shared/protocol';

interface Props {
  members: MemberView[];
  /** Turn mode: the player whose turn it is (highlighted). */
  activePlayerId?: number | null;
  /** Simultaneous mode: players who already fired this round (green check). */
  submitted?: number[];
}

export function PlayerChips({ members, activePlayerId = null, submitted = [] }: Props) {
  const living = members.filter((m) => m.alive).length;
  return (
    <div className="hud" aria-label="Players">
      <span className="hud-title">
        Alive <span data-testid="living-count">{living}/{members.length}</span>
      </span>
      {members.map((m) => {
        const active = activePlayerId === m.playerId;
        const locked = submitted.includes(m.playerId);
        return (
          <span
            key={m.playerId}
            className={`pill${active ? ' active' : ''}${m.alive ? '' : ' dead'}${m.connected ? '' : ' offline'}`}
            style={{ borderColor: locked ? '#4ade80' : active ? m.color : undefined }}
            title={`${m.name}${m.alive ? '' : ' (eliminated)'}${m.connected ? '' : ' (phone offline)'}`}
            data-testid={`player-${m.playerId}`}
          >
            <span className="dot small" style={{ background: m.alive ? m.color : '#475569' }} />P{m.playerId}
            {locked && <span aria-hidden="true"> ✓</span>}
            {!m.connected && <span aria-hidden="true"> ⚠</span>}
          </span>
        );
      })}
    </div>
  );
}
