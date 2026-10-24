import { Battlefield } from './components/Battlefield';
import { ConfirmRestartDialog } from './components/ConfirmRestartDialog';
import { FunctionInput } from './components/FunctionInput';
import { GameHUD } from './components/GameHUD';
import { GameOverModal } from './components/GameOverModal';
import { PassDeviceScreen } from './components/PassDeviceScreen';
import { TurnIndicator } from './components/TurnIndicator';
import { useGame } from '../hooks/useGame';

export function App() {
  const g = useGame();
  const { game } = g;
  const currentPlayer = game.players[game.turn.currentPlayerId];
  const status =
    game.status === 'over'
      ? `${game.winnerId ? game.players[game.winnerId].name : 'Nobody'} won`
      : g.isAnimating
        ? 'Shot in flight'
        : `${currentPlayer.name} to shoot`;

  return (
    <div className="app">
      <header className="header">
        <h1>Graphwars</h1>
        <span className="status" data-testid="match-status">
          {status}
        </span>
        <div className="header-actions">
          <label className="toggle">
            <input type="checkbox" checked={g.passEnabled} onChange={(e) => g.setPassEnabled(e.target.checked)} />
            Pass-the-device screen
          </label>
          <button className="btn" onClick={g.requestRestart}>
            Restart
          </button>
        </div>
      </header>

      <main className="main">
        <div className="field-area">
          <Battlefield
            state={game}
            selectedId={g.selectedId}
            preview={g.previewPoints}
            animation={g.animation}
            effects={g.effects}
            onSoldierClick={g.selectSoldier}
            onAnimationComplete={g.completeShot}
          />
          {g.passScreenFor !== null && (
            <PassDeviceScreen player={game.players[g.passScreenFor]} onContinue={g.continueFromPass} />
          )}
        </div>

        <aside className="side-panel">
          <TurnIndicator game={game} busy={g.isAnimating} />
          <GameHUD game={game} selected={g.selected} />
          <FunctionInput
            value={g.expression}
            onChange={g.setExpression}
            error={g.expressionError}
            onPreview={g.preview}
            onFire={g.fire}
            canFire={g.canFire}
            disabled={game.status === 'over' || g.isAnimating || g.passScreenFor !== null}
            fireLabel={g.isAnimating ? 'Firing…' : 'Fire!'}
          />
          <div className={`message ${g.message?.kind ?? ''}`} role="status" aria-live="polite" data-testid="message">
            {g.message?.text}
          </div>
        </aside>
      </main>

      {game.status === 'over' && <GameOverModal game={game} onPlayAgain={g.playAgain} />}
      {g.confirmingRestart && <ConfirmRestartDialog onConfirm={g.confirmRestart} onCancel={g.cancelRestart} />}
    </div>
  );
}
