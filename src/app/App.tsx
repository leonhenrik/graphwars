import { useState } from 'react';
import { Battlefield } from './components/Battlefield';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FunctionInput } from './components/FunctionInput';
import { GameHUD } from './components/GameHUD';
import { GameOverModal } from './components/GameOverModal';
import { PassDeviceScreen } from './components/PassDeviceScreen';
import { StartMenu } from './components/StartMenu';
import { TurnIndicator } from './components/TurnIndicator';
import { DEFAULT_CONFIG, getPlayer } from '../game/gameState';
import type { MatchConfig } from '../game/types';
import { useGame } from '../hooks/useGame';

export function App() {
  const g = useGame();
  const [menuConfig, setMenuConfig] = useState<MatchConfig>({
    ...DEFAULT_CONFIG,
    seed: Math.floor(Math.random() * 1_000_000),
  });

  if (g.screen === 'menu') {
    return <StartMenu config={menuConfig} onChange={setMenuConfig} onStart={g.startMatch} />;
  }

  const { game } = g;
  const currentPlayer = getPlayer(game, game.turn.currentPlayerId);
  const status =
    game.status === 'over'
      ? `${game.winnerId !== null ? getPlayer(game, game.winnerId).name : 'Nobody'} won`
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
          <button className="btn" onClick={g.requestMenu}>
            Menu
          </button>
          <button className="btn" onClick={g.requestRestart}>
            Restart
          </button>
        </div>
      </header>

      <main className="main">
        <div className="field-area">
          <Battlefield
            state={game}
            activeId={g.activeId}
            direction={g.direction}
            preview={g.previewPoints}
            animation={g.animation}
            effects={g.effects}
            onSoldierClick={g.clickSoldier}
            onAnimationComplete={g.completeShot}
          />
          {g.passScreenFor !== null && (
            <PassDeviceScreen player={getPlayer(game, g.passScreenFor)} onContinue={g.continueFromPass} />
          )}
        </div>

        <aside className="side-panel">
          <TurnIndicator game={game} busy={g.isAnimating} />
          <FunctionInput
            value={g.expression}
            onChange={g.setExpression}
            error={g.expressionError}
            onPreview={g.preview}
            onFire={g.fire}
            onToggleDirection={g.toggleDirection}
            direction={g.direction}
            canFire={g.canFire}
            disabled={g.turnLocked}
            fireLabel={g.isAnimating ? 'Firing…' : 'Fire!'}
          />
          <div className={`message ${g.message?.kind ?? ''}`} role="status" aria-live="polite" data-testid="message">
            {g.message?.text}
          </div>
          <GameHUD game={game} />
        </aside>
      </main>

      {game.status === 'over' && !g.isAnimating && (
        <GameOverModal game={game} onPlayAgain={g.playAgain} onMenu={g.goToMenu} />
      )}
      {g.confirm && (
        <ConfirmDialog
          title={g.confirm === 'menu' ? 'Return to the menu?' : 'Restart the match?'}
          confirmLabel={g.confirm === 'menu' ? 'Main menu' : 'Restart'}
          onConfirm={g.confirmAction}
          onCancel={g.cancelConfirm}
        />
      )}
    </div>
  );
}
