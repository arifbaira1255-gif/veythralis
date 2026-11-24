/**
 * Auto-refresh with identity rotation.
 *
 * The point is not "reload the page". A plain reload keeps the cookie jar, keeps the
 * user agent, and keeps every storage key — so the site sees the same visitor coming
 * back. What is wanted is: after N seconds the page goes away, the identity is
 * destroyed, and the next request is made by somebody the site has never met.
 *
 * So a refresh here is a four-step sequence, in this order:
 *
 *   1. WIPE    erase this origin's cookies, localStorage, sessionStorage, IndexedDB and
 *              Cache Storage from inside the page, before it unloads.
 *   2. ROTATE  mint a new seed, which regenerates the user agent, canvas/WebGL/audio
 *              noise, screen, timezone, fonts and the rest of the profile.
 *   3. CLEAR   drop the WebView's cache and flush the native cookie jar.
 *   4. LOAD    re-request the URL with the new identity.
 *
 * Steps 1 and 3 are the ones that are easy to skip and the reason most "auto refresh"
 * features do not actually defeat tracking.
 */

export type RefreshUnit = 'seconds' | 'minutes' | 'hours';

export type RefreshInterval = {
  /** 0 means off. */
  value: number;
  unit: RefreshUnit;
};

export const REFRESH_OFF: RefreshInterval = { value: 0, unit: 'minutes' };

/** The shortest interval allowed. Anything under 5 s hammers the origin and looks like an attack. */
export const REFRESH_MIN_SECONDS = 5;

/** One day. Beyond this the browser is not auto-refreshing, it is just open. */
export const REFRESH_MAX_SECONDS = 86400;

const UNIT_SECONDS: Record<RefreshUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
};

/** Seconds for an interval, or 0 when it is off. */
export function refreshSeconds(interval: RefreshInterval): number {
  if (!interval || !interval.value || interval.value <= 0) return 0;
  return interval.value * UNIT_SECONDS[interval.unit];
}

/**
 * Parse what the user typed into an interval.
 *
 * Accepts "30s", "30 s", "30 seconds", "5m", "5 min", "5 minutes", "2h", "2 hours",
 * "1h30m", and a bare number (read as minutes, which is what people mean).
 * Returns null when the text is not a duration at all, so the field can say so instead
 * of silently doing something the user did not ask for.
 */
export function parseRefreshInput(raw: string): RefreshInterval | null {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'off' || text === '0' || text === 'none') return REFRESH_OFF;

  // "1h30m" — the combined form, most useful for long intervals.
  const combined = text.match(/^(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*m(?:in(?:utes?)?|s?)?$/);
  if (combined) {
    const total = parseInt(combined[1], 10) * 3600 + parseInt(combined[2], 10) * 60;
    return intervalFromSeconds(total);
  }

  const m = text.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$/);
  if (!m) return null;

  const value = parseFloat(m[1]);
  if (!isFinite(value)) return null;
  const suffix = m[2] || 'm';

  let seconds: number;
  if (suffix.startsWith('s')) seconds = value;
  else if (suffix.startsWith('h')) seconds = value * 3600;
  else seconds = value * 60;

  return intervalFromSeconds(Math.round(seconds));
}

/**
 * Turn a second count into the largest unit that keeps the number readable, so an input
 * of "120 seconds" comes back as "2 minutes" rather than as a 120 sitting next to "s".
 */
function intervalFromSeconds(seconds: number): RefreshInterval {
  // Largest unit that divides exactly, so "1h30m" comes back as 90 minutes and not as a
  // 5400 sitting next to "seconds".
  if (seconds >= UNIT_SECONDS.hours && seconds % UNIT_SECONDS.hours === 0) {
    return { value: seconds / UNIT_SECONDS.hours, unit: 'hours' };
  }
  if (seconds >= UNIT_SECONDS.minutes && seconds % UNIT_SECONDS.minutes === 0) {
    return { value: seconds / UNIT_SECONDS.minutes, unit: 'minutes' };
  }
  return { value: Math.max(1, Math.round(seconds)), unit: 'seconds' };
}

/** Clamp to the allowed range and report what was actually applied. */
export function clampRefresh(interval: RefreshInterval): { applied: RefreshInterval; adjusted: boolean } {
  const seconds = refreshSeconds(interval);
  if (seconds === 0) return { applied: REFRESH_OFF, adjusted: false };
  if (seconds < REFRESH_MIN_SECONDS) {
    return { applied: { value: REFRESH_MIN_SECONDS, unit: 'seconds' }, adjusted: true };
  }
  if (seconds > REFRESH_MAX_SECONDS) {
    return { applied: { value: 24, unit: 'hours' }, adjusted: true };
  }
  return { applied: interval, adjusted: false };
}

/** "1h 30m", "45s", "5m" — for the chip on the browser chrome. */
export function formatRefresh(interval: RefreshInterval): string {
  const seconds = refreshSeconds(interval);
  if (!seconds) return 'Off';
  if (interval.unit === 'hours') return `${interval.value}h`;
  if (interval.unit === 'minutes') return `${interval.value}m`;
  return `${interval.value}s`;
}

/**
 * The in-page script that destroys this origin's client-side persistence before the
 * document goes away. Runs in the page, so it can reach Storage / IndexedDB / caches —
 * none of which the native layer can touch for a specific origin.
 *
 * Deliberately synchronous where it can be: an unload handler that only schedules async
 * work may be cancelled when the page tears down, so the cookie and Storage deletions
 * happen immediately and the async datastore deletions are fired without awaiting.
 */
export const PURGE_SCRIPT = String.raw`(function(){
  var report = { cookie: 0, storage: 0, idb: 0, cache: 0 };
  // ---- cookies: expire every cookie this origin can see, on every path and domain ----
  try {
    var pairs = String(document.cookie || '').split(';');
    for (var i = 0; i < pairs.length; i++) {
      var eq = pairs[i].indexOf('=');
      var name = (eq === -1 ? pairs[i] : pairs[i].slice(0, eq)).trim();
      if (!name) continue;
      var paths = ['/', location.pathname, location.pathname.replace(/\/[^/]*$/, '/')];
      var host = location.hostname;
      var domains = ['', host, '.' + host];
      var parts = host.split('.');
      for (var p = 1; p < parts.length - 1; p++) domains.push('.' + parts.slice(p).join('.'));
      for (var d = 0; d < domains.length; d++) {
        for (var q = 0; q < paths.length; q++) {
          var base = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + paths[q] +
            (domains[d] ? '; domain=' + domains[d] : '');
          document.cookie = base;
          document.cookie = base + '; secure';
          report.cookie++;
        }
      }
    }
  } catch (e) {}
  // ---- Web Storage ----
  try { report.storage += localStorage.length; localStorage.clear(); } catch (e) {}
  try { report.storage += sessionStorage.length; sessionStorage.clear(); } catch (e) {}
  // ---- IndexedDB ----
  try {
    if (window.indexedDB && indexedDB.databases) {
      indexedDB.databases().then(function (dbs) {
        (dbs || []).forEach(function (db) {
          if (db && db.name) { try { indexedDB.deleteDatabase(db.name); report.idb++; } catch (e) {} }
        });
      }).catch(function(){});
    }
  } catch (e) {}
  // ---- Cache Storage ----
  try {
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        (keys || []).forEach(function (k) { try { caches.delete(k); report.cache++; } catch (e) {} });
      }).catch(function(){});
    }
  } catch (e) {}
  // ---- Service workers: a worker survives a "clear cache" and can re-hydrate everything
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        (rs || []).forEach(function (r) { try { r.unregister(); } catch (e) {} });
      }).catch(function(){});
    }
  } catch (e) {}
  true;
})();`;
