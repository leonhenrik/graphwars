import { useEffect, useRef, useState, type FormEvent } from 'react';
import { fileToAvatar } from '../../client/photo';
import { MAX_PLAYER_NAME, type MemberView } from '../../shared/protocol';
import { Avatar } from './Avatar';

interface Props {
  you: MemberView;
  onPhoto: (image: string | null) => void;
  onName: (name: string) => void;
  disabled: boolean;
}

/**
 * Lobby only: take a selfie with the phone's own camera app. A file input with `capture` is used on purpose:
 * the in-page camera API (getUserMedia) is blocked by browsers on plain http:// addresses like the ones on the
 * local wifi, while this opens the native camera everywhere.
 */
export function SelfieCard({ you, onPhoto, onName, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(you.name);
  const hasPhoto = you.photoRev > 0;

  useEffect(() => setNameDraft(you.name), [you.name]);

  const trimmed = nameDraft.trim();
  const canSaveName = !disabled && trimmed.length > 0 && trimmed !== you.name;

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    if (canSaveName) onName(trimmed);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onPhoto(await fileToAvatar(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that photo.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <section className="selfie" data-testid="selfie-card">
      <Avatar member={you} size={96}>
        {you.playerId}
      </Avatar>
      <div className="selfie-actions">
        <form className="name-form" onSubmit={saveName} data-testid="name-form">
          <input
            className="name-input"
            type="text"
            maxLength={MAX_PLAYER_NAME}
            value={nameDraft}
            placeholder="Your name"
            aria-label="Your name"
            disabled={disabled}
            data-testid="name-input"
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!canSaveName} data-testid="name-save">
            Save name
          </button>
        </form>
        <p className="selfie-hint">
          {hasPhoto ? 'Looking good! This photo is your bubble on the big screen.' : 'Take a selfie: it fills your bubble on the big screen.'}
        </p>
        <div className="button-row">
          <button type="button" className="btn primary" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Processing…' : hasPhoto ? '📷 Retake' : '📷 Take selfie'}
          </button>
          {hasPhoto && (
            <button type="button" className="btn" disabled={disabled || busy} onClick={() => onPhoto(null)}>
              Remove
            </button>
          )}
        </div>
        {error && <p className="selfie-error">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        data-testid="selfie-input"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </section>
  );
}
