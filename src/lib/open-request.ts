/**
 * A one-slot hand-off between the Settings screen and the browser screen.
 *
 * The multi-tab opener is configured in Settings but has to run in the browser, because
 * that is where the tabs live. The two are separate screens in the tab navigator, and
 * either can be mounted first, so a React context would not reach across reliably.
 *
 * This is a module-level slot instead: Settings writes a request, the browser screen
 * takes it when it next gains focus. `take` clears the slot, so a request is acted on
 * exactly once and a stale one cannot fire again on a later visit.
 */

export type OpenRequest = {
  /** The URL the user typed. */
  url: string;
  /** How many tabs to open it in. */
  count: number;
};

let pending: OpenRequest | null = null;

/** Queue a request. Called by Settings. */
export function requestOpenInTabs(url: string, count: number): void {
  pending = { url, count };
}

/**
 * Take the queued request, if any, and clear it.
 *
 * Returns null when there is nothing waiting, which is the common case — the browser
 * screen calls this on every focus.
 */
export function takeOpenRequest(): OpenRequest | null {
  const p = pending;
  pending = null;
  return p;
}

/** True when a request is waiting, without consuming it. */
export function hasOpenRequest(): boolean {
  return pending !== null;
}
