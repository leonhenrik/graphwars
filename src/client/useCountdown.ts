import { useEffect, useState } from 'react';
import type { TimerView } from '../shared/protocol';

/**
 * Seconds-resolution countdown driven by a server-reported TimerView. The server sends the time left
 * at send time; we count down from the moment the message was received, so device clocks don't matter.
 */
export function useCountdown(timer: TimerView | null): { remainingMs: number; fraction: number } | null {
  const [now, setNow] = useState(() => performance.now());
  const [receivedAt, setReceivedAt] = useState(() => performance.now());

  useEffect(() => {
    setReceivedAt(performance.now());
    setNow(performance.now());
  }, [timer?.remainingMs, timer?.totalMs]);

  const active = timer !== null;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [active]);

  if (!timer) return null;
  const remainingMs = Math.max(0, timer.remainingMs - (now - receivedAt));
  return { remainingMs, fraction: timer.totalMs > 0 ? remainingMs / timer.totalMs : 0 };
}
