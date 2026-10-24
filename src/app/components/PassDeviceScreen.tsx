import type { Player } from '../../game/types';

export function PassDeviceScreen({ player, onContinue }: { player: Player; onContinue: () => void }) {
  return (
    <div className="pass-screen" data-testid="pass-screen">
      <div className="modal">
        <h2 style={{ color: player.color }}>{player.name}'s turn</h2>
        <p>Pass the device, then continue.</p>
        <button className="btn primary" onClick={onContinue} autoFocus>
          Continue
        </button>
      </div>
    </div>
  );
}
