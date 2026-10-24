import { useCountdown } from '../../client/useCountdown';
import type { TimerView } from '../../shared/protocol';

export function Countdown({ timer, compact = false }: { timer: TimerView | null; compact?: boolean }) {
  const countdown = useCountdown(timer);
  if (!countdown) return null;
  const seconds = Math.ceil(countdown.remainingMs / 1000);
  const urgent = seconds <= 5;
  return (
    <div className={`countdown${urgent ? ' urgent' : ''}${compact ? ' compact' : ''}`} data-testid="countdown" role="timer">
      <span className="countdown-time">{seconds}s</span>
      <span className="countdown-track">
        <span className="countdown-fill" style={{ width: `${Math.round(countdown.fraction * 100)}%` }} />
      </span>
    </div>
  );
}
