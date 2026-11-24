export type SearchEngine = 'duckduckgo' | 'brave' | 'google';

export const SEARCH_ENGINES: Record<SearchEngine, { label: string; query: string }> = {
  duckduckgo: { label: 'DuckDuckGo', query: 'https://duckduckgo.com/?q=' },
  brave: { label: 'Brave Search', query: 'https://search.brave.com/search?q=' },
  google: { label: 'Google', query: 'https://www.google.com/search?q=' },
};

/** True when the text looks like a host or a full URL rather than a search phrase. */
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (!s || /\s/.test(s)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return true;
  // A dotted name with a plausible TLD, optionally with a port or path.
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|:|\?|#)/i.test(s);
}

/**
 * Turn whatever the user typed into a URL to load. Bare hosts get https://, and
 * anything that is not a URL becomes a search on the chosen engine.
 */
export function toUrl(input: string, engine: SearchEngine): string {
  const s = input.trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  if (looksLikeUrl(s)) return `https://${s}`;
  return SEARCH_ENGINES[engine].query + encodeURIComponent(s);
}

/** The hostname of a URL, or an empty string when it cannot be parsed. */
export function hostOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : '';
}

/** A short label for a tab: the host without a leading www. */
export function shortHost(url: string): string {
  const h = hostOf(url);
  return h.replace(/^www\./, '') || 'New tab';
}

/** Upgrade http:// to https://. Returns the same string when it is already secure. */
export function toHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

export function isHttp(url: string): boolean {
  return /^http:\/\//i.test(url);
}
