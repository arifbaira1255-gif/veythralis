import { usePersistentState } from '@/hooks/use-persistent-state';

import { DEFAULT_HEADER_SETTINGS, type HeaderSettings } from './header-rules';
import type { PersonaMode } from './persona';
import type { BurnInterval } from './session-burn';
import type { SearchEngine } from './url';

export type PrivacySettings = {
  /** Upgrade every http:// navigation to https:// and refuse plain-http loads. */
  httpsOnly: boolean;
  /** Resolve DNS over HTTPS instead of the network's resolver. */
  dnsOverHttps: boolean;
  /** Send no referrer at all, rather than a trimmed origin. */
  blockReferrer: boolean;
  /** Refuse cookies set by a different site than the one being visited. */
  blockThirdPartyCookies: boolean;
  /** Randomize the fingerprint at the start of every session. */
  randomizeFingerprint: boolean;
  /** Give every tab its own fingerprint, not just every session. */
  perTabFingerprint: boolean;
  /** Wipe all browsing data when the app is closed. */
  clearOnExit: boolean;
  /** Destroy the session automatically after this many minutes (0 = off). */
  burnInterval: BurnInterval;
  /** Send the legally binding Global Privacy Control opt-out signal. */
  globalPrivacyControl: boolean;
  /** Suppress WebRTC local-IP candidates that leak the real address. */
  blockWebRtcLeak: boolean;
  /** Coarsen high-resolution timers used for side-channel fingerprinting. */
  coarsenTimers: boolean;
  /** Which search engine the address bar uses for non-URL input. */
  searchEngine: SearchEngine;
  /** Blend into a common device cohort, or rotate through a wide identity space. */
  personaMode: PersonaMode;
  /** Remove utm_*, fbclid, gclid and friends from every URL before it is requested. */
  stripTrackingParams: boolean;
  /** Make the timezone and locale match the country of the site being visited. */
  geoCoherentPersona: boolean;
  /** Measure the fingerprint from inside the page and show what the site really sees. */
  liveProbe: boolean;
  /** Block CNAME-cloaked analytics endpoints that look like first-party subdomains. */
  blockCnameCloaking: boolean;
};

export const DEFAULT_SETTINGS: PrivacySettings = {
  httpsOnly: true,
  dnsOverHttps: true,
  blockReferrer: true,
  blockThirdPartyCookies: true,
  randomizeFingerprint: true,
  perTabFingerprint: true,
  clearOnExit: true,
  burnInterval: 0,
  globalPrivacyControl: true,
  blockWebRtcLeak: true,
  coarsenTimers: true,
  searchEngine: 'duckduckgo',
  personaMode: 'blend',
  stripTrackingParams: true,
  geoCoherentPersona: true,
  liveProbe: true,
  blockCnameCloaking: true,
};

/** The DoH resolver used when DNS-over-HTTPS is on. */
export const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

/** The header rules implied by the current settings. */
export function headerSettingsFrom(settings: PrivacySettings): HeaderSettings {
  return {
    ...DEFAULT_HEADER_SETTINGS,
    globalPrivacyControl: settings.globalPrivacyControl,
    stripReferrer: settings.blockReferrer,
    disableClientHints: settings.randomizeFingerprint,
  };
}

/**
 * Settings live on the device under one key, so every screen that reads them stays in
 * step (the browser screen and the settings screen share this hook).
 */
export function usePrivacySettings() {
  return usePersistentState<PrivacySettings>('privacy-settings', DEFAULT_SETTINGS);
}
