export function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title" data-testid="confirm-dialog">
      <div className="modal">
        <h2 id="confirm-title">{title}</h2>
        <p>The current match will be lost.</p>
        <div className="button-row">
          <button className="btn" onClick={onCancel} autoFocus>
            Keep playing
          </button>
          <button className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
