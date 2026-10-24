export function ConfirmRestartDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="restart-title" data-testid="confirm-restart">
      <div className="modal">
        <h2 id="restart-title">Restart the match?</h2>
        <p>The current match will be lost.</p>
        <div className="button-row">
          <button className="btn" onClick={onCancel} autoFocus>
            Keep playing
          </button>
          <button className="btn danger" onClick={onConfirm}>
            Restart
          </button>
        </div>
      </div>
    </div>
  );
}
