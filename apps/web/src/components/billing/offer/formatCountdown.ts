/**
 * Honest countdown string for the offer banner.
 *  - > 1 hour:  "Nд HH:MM" (the "Nд " part is dropped when 0 days)
 *  - <= 1 hour: "MM:SS"
 * Clamps to "0:00" at/under zero. Digits are meant to render in `tabular-nums`.
 */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return '0:00';
  const totalSec = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const ONE_HOUR_MS = 60 * 60 * 1000;
  if (msRemaining > ONE_HOUR_MS) {
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return days > 0 ? `${days}д ${hh}:${mm}` : `${hh}:${mm}`;
  }
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}
