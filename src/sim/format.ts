/**
 * Number formatting for cards, readouts and status lines. Everything speaks
 * one dialect: integers, digit groups separated by a thin space - aerospace
 * convention, and it teaches place value for free.
 */

const THIN_SPACE = '\u2009';

/** Rounds to an integer and groups digits in threes: 7158 -> '7 158'. */
export function formatInt(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  return sign + grouped;
}

export function formatKm(km: number): string {
  return `${formatInt(km)} km`;
}

export function formatMS(ms: number): string {
  return `${formatInt(ms)} m/s`;
}

/**
 * Countdown clock: 41 -> 'T-00:41'. A moment already passed reads 'T+00:12' -
 * stating what the mission did rather than hiding it.
 */
export function formatCountdown(seconds: number): string {
  const total = Math.round(Math.abs(seconds));
  const sign = seconds < 0 && total > 0 ? '+' : '-';
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `T${sign}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
