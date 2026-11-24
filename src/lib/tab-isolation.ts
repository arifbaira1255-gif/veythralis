/**
 * Per-tab identity and isolation.
 *
 * Each tab gets its own id. That id is used for two things:
 *   1. the storage namespace injected into the page (see fingerprint.ts), so two tabs on
 *      the same origin cannot read each other's localStorage / IndexedDB;
 *   2. the WebView's `incognito` mode, so nothing is written to the app's persistent
 *      cookie jar and closing the tab discards its cookies and cache.
 *
 * Honest limit: React Native's WebView keeps one cookie store per app process, so
 * cookies are isolated per *tab lifetime* (incognito + clear on close) rather than by a
 * separate cookie jar per tab. Storage is namespaced per tab, which is the part that
 * actually stops one site reading another's data.
 */

import type { ProbeResult } from './fingerprint-probe';

export type Tab = {
  id: string;
  url: string;
  title: string;
  /** True once the user has navigated away from the start page. */
  started: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  /** Trackers blocked in this tab during its lifetime. */
  blocked: number;
  /** Hosts that were blocked, newest first, capped for display. */
  blockedHosts: string[];
  /** Tracking parameters stripped from URLs in this tab. */
  strippedParams: number;
  /** The most recent parameter names removed, for the panel. */
  strippedNames: string[];
  /** CNAME-cloaked analytics endpoints caught in this tab. */
  cloaked: number;
  /** The live probe result, once the page has reported one. */
  probe: ProbeResult | null;
  /** True while a probe is in flight. */
  probing: boolean;
};

let counter = 0;

export function newTabId(): string {
  counter += 1;
  return `t${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createTab(url = ''): Tab {
  return {
    id: newTabId(),
    url,
    title: url ? url : 'New tab',
    started: Boolean(url),
    canGoBack: false,
    canGoForward: false,
    loading: false,
    blocked: 0,
    blockedHosts: [],
    strippedParams: 0,
    strippedNames: [],
    cloaked: 0,
    probe: null,
    probing: false,
  };
}

/** Keep the blocked-host list short; the count is what matters. */
export function addBlockedHost(tab: Tab, host: string): Tab {
  if (tab.blockedHosts.includes(host)) {
    return { ...tab, blocked: tab.blocked + 1 };
  }
  return {
    ...tab,
    blocked: tab.blocked + 1,
    blockedHosts: [host, ...tab.blockedHosts].slice(0, 40),
  };
}

/** Record tracking parameters that were stripped from a URL. */
export function addStrippedParams(tab: Tab, names: string[]): Tab {
  if (names.length === 0) return tab;
  const merged = [...names, ...tab.strippedNames.filter((n) => !names.includes(n))];
  return {
    ...tab,
    strippedParams: tab.strippedParams + names.length,
    strippedNames: merged.slice(0, 24),
  };
}

/** Record a CNAME-cloaked analytics endpoint that was caught. */
export function addCloaked(tab: Tab): Tab {
  return { ...tab, cloaked: tab.cloaked + 1 };
}
