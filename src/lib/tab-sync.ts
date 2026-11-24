/**
 * Multi-tab opening and tab mirroring.
 *
 * Two features live here, and they share one idea: several tabs that are genuinely
 * separate identities (own fingerprint, own user agent, own cookies) but that the user
 * can drive as one.
 *
 *  1. OPEN IN N TABS — one URL, N tabs, each with its own identity. Useful for seeing how
 *     a page behaves for N different "people" at once.
 *
 *  2. MIRROR — after those tabs are open, whatever the user does in the leader tab is
 *     replayed in every follower: a click at (x, y), a scroll, a typed string, a key, or a
 *     navigation. The user drives one tab and watches the rest follow.
 *
 * The mirror is deliberately one-way (leader -> followers). Two-way mirroring of clicks
 * between N tabs is a feedback loop: tab A's replayed click fires A's own listener, which
 * replays into B, whose listener fires again, and the tabs ping-pong forever. One leader
 * is the only version of this that is stable, so that is the version that ships.
 *
 * Everything in this file is pure: no React, no WebView, no timers. The screen wires it
 * up, and the harness in scripts/verify-tabsync.mjs tests it directly.
 */

/** How many tabs the opener will create in one go. */
export const MIN_OPEN_COUNT = 2;
export const MAX_OPEN_COUNT = 12;
export const DEFAULT_OPEN_COUNT = 4;

/** What the leader tab reports, and what the followers replay. */
export type SyncAction =
  | { kind: 'navigate'; url: string }
  | { kind: 'click'; x: number; y: number }
  | { kind: 'scroll'; x: number; y: number }
  | { kind: 'text'; text: string }
  | { kind: 'key'; key: string };

export type MirrorState = {
  /** Whether replay is currently active. */
  enabled: boolean;
  /** The tab the user drives. Its actions are the ones that get replayed. */
  leaderId: string | null;
  /** The tabs that follow the leader. Never contains the leader. */
  followerIds: string[];
};

export const MIRROR_OFF: MirrorState = { enabled: false, leaderId: null, followerIds: [] };

/**
 * Clamp a requested tab count into the range the UI offers.
 *
 * A count of 1 is not "open in one tab" — it is just a normal navigation, and the caller
 * should not be in this code path at all. It is clamped up to 2 rather than rejected so a
 * stray 1 from a text field cannot silently do nothing.
 */
export function clampOpenCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_OPEN_COUNT;
  const i = Math.floor(n);
  if (i < MIN_OPEN_COUNT) return MIN_OPEN_COUNT;
  if (i > MAX_OPEN_COUNT) return MAX_OPEN_COUNT;
  return i;
}

/**
 * Build the mirror state for a freshly opened group.
 *
 * The first tab is the leader by default: the user just opened N tabs and the one they
 * are looking at is the natural one to drive. `leaderIndex` lets the caller pick another.
 */
export function startMirror(tabIds: string[], leaderIndex = 0): MirrorState {
  if (tabIds.length < 2) return MIRROR_OFF;
  const idx = leaderIndex >= 0 && leaderIndex < tabIds.length ? leaderIndex : 0;
  const leaderId = tabIds[idx];
  return {
    enabled: true,
    leaderId,
    followerIds: tabIds.filter((id) => id !== leaderId),
  };
}

/** Turn mirroring off, keeping nothing. */
export function stopMirror(): MirrorState {
  return MIRROR_OFF;
}

/**
 * Move the leader to another tab in the group.
 *
 * The old leader becomes a follower and the new one stops following, so the group stays
 * exactly one leader plus the rest. Passing an id that is not in the group is a no-op
 * rather than an error: the tab may have been closed between the tap and the handler.
 */
export function setLeader(state: MirrorState, tabId: string): MirrorState {
  if (!state.enabled) return state;
  const group = [state.leaderId, ...state.followerIds].filter((x): x is string => !!x);
  if (!group.includes(tabId)) return state;
  return {
    enabled: true,
    leaderId: tabId,
    followerIds: group.filter((id) => id !== tabId),
  };
}

/**
 * Drop a tab from the group — it was closed.
 *
 * If the leader is the one that closed, the first remaining follower is promoted, because
 * a group with no leader is a group that silently stops mirroring. If fewer than two tabs
 * remain there is nothing left to mirror, so mirroring turns off.
 */
export function removeFromMirror(state: MirrorState, tabId: string): MirrorState {
  if (!state.enabled) return state;
  const followers = state.followerIds.filter((id) => id !== tabId);
  if (state.leaderId === tabId) {
    // Promoting the last follower would leave a "group" of one tab with nobody to
    // mirror into — mirroring that is on but does nothing. One tab is not a group, so
    // it turns off instead.
    if (followers.length < 2) return MIRROR_OFF;
    const [next, ...rest] = followers;
    return { enabled: true, leaderId: next, followerIds: rest };
  }
  if (followers.length < 1) return MIRROR_OFF;
  return { enabled: true, leaderId: state.leaderId, followerIds: followers };
}

/** True when this tab's actions should be replayed into the others. */
export function isLeader(state: MirrorState, tabId: string): boolean {
  return state.enabled && state.leaderId === tabId;
}

/** True when this tab should receive replays. */
export function isFollower(state: MirrorState, tabId: string): boolean {
  return state.enabled && state.followerIds.includes(tabId);
}

/**
 * Validate an action that arrived from a WebView.
 *
 * The message channel is a string boundary, so anything can arrive — a malformed payload,
 * a page's own postMessage, a truncated frame. An action that does not match the shape is
 * dropped rather than replayed, because replaying a half-parsed click would move every
 * follower to a random point on the page.
 */
export function parseSyncAction(raw: unknown): SyncAction | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  switch (a.kind) {
    case 'navigate': {
      if (typeof a.url !== 'string' || !a.url) return null;
      // Only http(s) is replayable. A javascript: or data: URL arriving here would be
      // executed in every follower, which is exactly the kind of thing this must not do.
      if (!/^https?:\/\//i.test(a.url)) return null;
      return { kind: 'navigate', url: a.url };
    }
    case 'click': {
      const x = num(a.x);
      const y = num(a.y);
      if (x === null || y === null) return null;
      return { kind: 'click', x, y };
    }
    case 'scroll': {
      const x = num(a.x);
      const y = num(a.y);
      if (x === null || y === null) return null;
      return { kind: 'scroll', x, y };
    }
    case 'text': {
      if (typeof a.text !== 'string') return null;
      return { kind: 'text', text: a.text };
    }
    case 'key': {
      if (typeof a.key !== 'string' || !a.key) return null;
      return { kind: 'key', key: a.key };
    }
    default:
      return null;
  }
}

/**
 * The script injected into the LEADER tab.
 *
 * It reports what the user does. It does not act on anything itself, so a page that
 * inspects its own event listeners sees nothing unusual.
 *
 * Clicks are reported in viewport coordinates, which is what the follower needs to replay
 * them: the follower is at the same scroll position (scroll is mirrored too), so the same
 * viewport point is the same element.
 */
export function buildLeaderScript(): string {
  return `(function(){
  if (window.__vth_mirror_leader) return;
  window.__vth_mirror_leader = true;
  var post = function(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} };
  document.addEventListener('click', function(e){
    post({ kind: 'click', x: e.clientX, y: e.clientY });
  }, true);
  var last = 0;
  window.addEventListener('scroll', function(){
    var now = Date.now();
    if (now - last < 120) return;
    last = now;
    post({ kind: 'scroll', x: window.scrollX, y: window.scrollY });
  }, { passive: true });
  document.addEventListener('keydown', function(e){
    if (e.key && e.key.length === 1) return;
    post({ kind: 'key', key: e.key });
  }, true);
  true;
})();`;
}

/**
 * The script injected into a FOLLOWER tab.
 *
 * It replays one action. Clicks are dispatched at the element under the recorded point,
 * not at the point itself, because a synthetic MouseEvent with clientX/clientY does not
 * activate anything on its own — the browser routes a real click to the element at that
 * position, so the replay has to do the same lookup.
 *
 * The replayed click is marked so the follower's own listener (if it were ever the leader)
 * can ignore it, which is the second half of the loop guard.
 */
export function buildFollowerScript(action: SyncAction): string {
  const payload = JSON.stringify(action);
  return `(function(){
  var a = ${payload};
  try {
    if (a.kind === 'click') {
      var el = document.elementFromPoint(a.x, a.y);
      if (el) {
        var ev = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: a.x, clientY: a.y, view: window });
        ev.__vth_replay = true;
        el.dispatchEvent(ev);
      }
    } else if (a.kind === 'scroll') {
      window.scrollTo(a.x, a.y);
    } else if (a.kind === 'navigate') {
      window.location.href = a.url;
    } else if (a.kind === 'text') {
      var f = document.activeElement;
      if (f && (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA')) {
        f.value = a.text;
        f.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (a.kind === 'key') {
      var t = document.activeElement || document.body;
      t.dispatchEvent(new KeyboardEvent('keydown', { key: a.key, bubbles: true }));
      t.dispatchEvent(new KeyboardEvent('keyup', { key: a.key, bubbles: true }));
    }
  } catch (e) {}
  true;
})();`;
}

/**
 * A short human label for an action, for the mirror status line in the UI.
 */
export function describeAction(action: SyncAction): string {
  switch (action.kind) {
    case 'navigate':
      return `navigate to ${action.url}`;
    case 'click':
      return `click at ${Math.round(action.x)}, ${Math.round(action.y)}`;
    case 'scroll':
      return `scroll to ${Math.round(action.y)}`;
    case 'text':
      return `type "${action.text.slice(0, 24)}"`;
    case 'key':
      return `key ${action.key}`;
  }
}
