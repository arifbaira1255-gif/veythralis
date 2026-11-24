/**
 * Request-header rules.
 *
 * Two things a page cannot do for itself, and which most mobile browsers do not do at
 * all, are handled here:
 *
 *   1. Global Privacy Control (GPC). `Sec-GPC: 1` is a legally recognised opt-out
 *      signal under the CCPA/CPRA and similar laws. Sending it is a real, enforceable
 *      request not to sell or share the user's data — not a polite suggestion like the
 *      old Do Not Track header.
 *
 *   2. Referrer suppression. The `Referer` header leaks the full URL of the page you
 *      came from, including any query string. Stripping it stops a site learning what
 *      you were reading before you arrived.
 *
 * The rules are expressed as a list so the WebView layer can apply them uniformly and
 * the shield panel can show exactly what is being sent.
 */

export type HeaderRule = {
  /** Header name to set (or remove, when value is null). */
  name: string;
  /** Value to send, or null to strip the header entirely. */
  value: string | null;
  /** Human-readable reason, shown in the shield panel. */
  reason: string;
};

export type HeaderSettings = {
  /** Send `Sec-GPC: 1` on every request. */
  globalPrivacyControl: boolean;
  /** Strip the `Referer` header entirely. */
  stripReferrer: boolean;
  /** Ask for no client hints, which are a modern fingerprinting surface. */
  disableClientHints: boolean;
};

export const DEFAULT_HEADER_SETTINGS: HeaderSettings = {
  globalPrivacyControl: true,
  stripReferrer: true,
  disableClientHints: true,
};

/** The headers to apply for the current settings. */
export function buildHeaderRules(settings: HeaderSettings): HeaderRule[] {
  const rules: HeaderRule[] = [];
  if (settings.globalPrivacyControl) {
    rules.push({
      name: 'Sec-GPC',
      value: '1',
      reason: 'Legally binding opt-out from the sale or sharing of your data.',
    });
  }
  if (settings.stripReferrer) {
    rules.push({
      name: 'Referer',
      value: null,
      reason: 'Stops a site learning which page you came from.',
    });
  }
  if (settings.disableClientHints) {
    rules.push({
      name: 'Sec-CH-UA',
      value: null,
      reason: 'Client hints are a modern fingerprinting surface; we send none.',
    });
    rules.push({
      name: 'Sec-CH-UA-Mobile',
      value: null,
      reason: 'Client hints are a modern fingerprinting surface; we send none.',
    });
    rules.push({
      name: 'Sec-CH-UA-Platform',
      value: null,
      reason: 'Client hints are a modern fingerprinting surface; we send none.',
    });
  }
  return rules;
}

/** A short summary for the shield panel. */
export function headerSummary(settings: HeaderSettings): string {
  const on: string[] = [];
  if (settings.globalPrivacyControl) on.push('GPC');
  if (settings.stripReferrer) on.push('no-referrer');
  if (settings.disableClientHints) on.push('no client hints');
  return on.length ? on.join(' · ') : 'none';
}
