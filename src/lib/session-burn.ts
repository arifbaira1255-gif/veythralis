/**
 * Session burn timer.
 *
 * A privacy browser that only wipes on exit still leaves a long-lived session for
 * anyone who never closes the app. The burn timer puts a hard ceiling on how long a
 * session can live: when it expires, every tab's storage, cookies, cache and
 * fingerprint are destroyed and a fresh identity is minted.
 *
 * This is deliberately a *countdown from the last reset*, not an idle timer — an idle
 * timer can be defeated by a page that keeps a background timer alive.
 */

export type BurnInterval = 0 | 5 | 15 | 30 | 60;

export const BURN_OPTIONS: readonly { value: BurnInterval; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

/** Milliseconds until the next burn, or null when the timer is off. */
export function burnDelayMs(interval: BurnInterval): number | null {
  if (!interval) return null;
  return interval * 60 * 1000;
}

/** "12:34" style countdown for the shield panel. */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return '0:00';
  const total = Math.ceil(msRemaining / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
