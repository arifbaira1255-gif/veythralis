/**
 * Tracking-parameter stripping.
 *
 * Most tracking on the "privacy-respecting" web does not happen through a script at
 * all: it rides in the URL. A link shared on a social network arrives with `fbclid`,
 * `igshid` or `si`; an ad landing page carries `gclid` / `msclkid` / `dclid`; an email
 * carries `mc_eid`; every marketing link carries a family of `utm_*` values. None of
 * these change what the page shows. All of them let the destination attach this visit
 * to an identity built somewhere else.
 *
 * Blocking the request would break the link, so Zuno does what almost no mobile browser
 * does: **it rewrites the URL before the request goes out**, removing the identifiers
 * and leaving the functional parameters untouched.
 *
 * There is a second, subtler attack this defeats. "Bounce tracking" works like this: you
 * click a link to site B, but it first redirects through tracker T, which records the
 * click and decorates the final URL with its own id. Stripping the parameter on every
 * hop means the decorated id never survives the next navigation.
 */

/** Exact parameter names that are pure identifiers. Matched case-insensitively. */
export const TRACKING_PARAMS: readonly string[] = [
  // Google Ads / Analytics
  'gclid',
  'gclsrc',
  'gbraid',
  'wbraid',
  'dclid',
  'gad_source',
  'gad_campaignid',
  'srsltid',
  // Meta / Facebook / Instagram
  'fbclid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  'fb_ref',
  'igshid',
  'igsh',
  'si',
  // Microsoft / Bing
  'msclkid',
  // Twitter / X
  'twclid',
  'ref_src',
  'ref_url',
  // TikTok
  'ttclid',
  'tt_medium',
  'tt_content',
  // LinkedIn
  'li_fat_id',
  'trk',
  'trkCampaign',
  // Mailchimp / email marketing
  'mc_eid',
  'mc_cid',
  'mkt_tok',
  'oly_anon_id',
  'oly_enc_id',
  // HubSpot
  '_hsenc',
  '_hsmi',
  'hsCtaTracking',
  // Adobe / Omniture
  's_cid',
  'ICID',
  // Yandex
  'yclid',
  'ysclid',
  // Snapchat
  'ScCid',
  // Reddit
  'rdt_cid',
  // Pinterest
  'epik',
  // Amazon
  'tag',
  'ref_',
  '_encoding',
  // Generic redirect / affiliate
  'vero_conv',
  'vero_id',
  'wickedid',
  'irclickid',
  'irgwc',
  'aff_id',
  'affid',
  'affiliate_id',
  'partner_id',
  'clickid',
  'click_id',
  'campaign_id',
  'source_id',
  'tracking_id',
  'cid',
  'sid',
];

/** Parameter *prefixes* that are always identifiers (utm_source, pk_campaign, …). */
export const TRACKING_PREFIXES: readonly string[] = [
  'utm_',
  'pk_',
  'mtm_',
  'hsa_',
  'matomo_',
  'piwik_',
  'at_',
  'sc_',
  'elq',
  '_openstat',
];

/**
 * Parameters that look like identifiers but are load-bearing for the page. Stripping
 * these breaks search, pagination or mail links, so they are always kept.
 */
export const KEEP_PARAMS: readonly string[] = [
  'q',
  'query',
  'search',
  's',
  'p',
  'page',
  'id',
  'v',
  't',
  'lang',
  'locale',
  'hl',
  'start',
  'offset',
  'limit',
  'tab',
  'section',
  'ref',
  'code',
  'token',
  'redirect',
  'next',
  'return',
  'callback',
];

function isTrackingParam(rawName: string): boolean {
  const name = rawName.toLowerCase();
  if (KEEP_PARAMS.includes(name)) return false;
  if (TRACKING_PARAMS.some((p) => p.toLowerCase() === name)) return true;
  return TRACKING_PREFIXES.some((p) => name.startsWith(p));
}

export type StripResult = {
  /** The URL with identifiers removed. Equal to the input when nothing matched. */
  url: string;
  /** Parameter names that were removed, for the shield panel. */
  removed: string[];
};

/**
 * Remove tracking parameters from a URL. Fragment and path are preserved byte for byte
 * (only the query string is rebuilt), so signed paths and `#anchors` keep working.
 */
export function stripTrackingParams(rawUrl: string): StripResult {
  if (!rawUrl || rawUrl.indexOf('?') === -1) return { url: rawUrl, removed: [] };

  const hashAt = rawUrl.indexOf('#');
  const withoutHash = hashAt === -1 ? rawUrl : rawUrl.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : rawUrl.slice(hashAt);

  const qAt = withoutHash.indexOf('?');
  if (qAt === -1) return { url: rawUrl, removed: [] };

  const base = withoutHash.slice(0, qAt);
  const query = withoutHash.slice(qAt + 1);
  if (!query) return { url: base + hash, removed: [] };

  const kept: string[] = [];
  const removed: string[] = [];

  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const name = eq === -1 ? pair : pair.slice(0, eq);
    if (!name) continue;
    if (isTrackingParam(decodeURIComponent(name))) {
      removed.push(decodeURIComponent(name));
    } else {
      kept.push(pair);
    }
  }

  if (removed.length === 0) return { url: rawUrl, removed: [] };
  const rebuilt = kept.length ? `${base}?${kept.join('&')}${hash}` : `${base}${hash}`;
  return { url: rebuilt, removed };
}

/** True when the URL carries at least one tracking identifier. */
export function hasTrackingParams(rawUrl: string): boolean {
  return stripTrackingParams(rawUrl).removed.length > 0;
}

/**
 * Known CNAME-cloaked tracker hosts. These are third-party analytics providers served
 * from a *first-party-looking* subdomain, so a plain blocklist by domain never catches
 * them: the request goes to `metrics.yoursite.com`, which is a CNAME to the tracker.
 *
 * Catching the actual DNS record needs a resolver we do not have on-device, so Zuno
 * matches the subdomain *labels* these providers conventionally use plus the provider
 * domains themselves when they appear anywhere in the host.
 */
export const CNAME_CLOAK_PATTERNS: readonly { pattern: string; provider: string }[] = [
  { pattern: 'omtrdc.net', provider: 'Adobe Analytics' },
  { pattern: '2o7.net', provider: 'Adobe Analytics' },
  { pattern: 'demdex.net', provider: 'Adobe Audience Manager' },
  { pattern: 'everesttech.net', provider: 'Adobe Advertising' },
  { pattern: 'at-o.net', provider: 'AT Internet' },
  { pattern: 'sc.omtrdc.net', provider: 'Adobe Analytics' },
  { pattern: 'mxpnl.com', provider: 'Mixpanel' },
  { pattern: 'segment.io', provider: 'Segment' },
  { pattern: 'segment.com', provider: 'Segment' },
  { pattern: 'amplitude.com', provider: 'Amplitude' },
  { pattern: 'heapanalytics.com', provider: 'Heap' },
  { pattern: 'fullstory.com', provider: 'FullStory' },
  { pattern: 'hotjar.com', provider: 'Hotjar' },
  { pattern: 'clarity.ms', provider: 'Microsoft Clarity' },
  { pattern: 'nr-data.net', provider: 'New Relic' },
  { pattern: 'krxd.net', provider: 'Salesforce DMP' },
  { pattern: 'agkn.com', provider: 'Neustar' },
  { pattern: 'rlcdn.com', provider: 'LiveRamp' },
  { pattern: 'crwdcntrl.net', provider: 'Lotame' },
  { pattern: 'moatads.com', provider: 'Oracle Moat' },
  { pattern: 'adsrvr.org', provider: 'The Trade Desk' },
  { pattern: 'casalemedia.com', provider: 'Index Exchange' },
  { pattern: 'rubiconproject.com', provider: 'Magnite' },
  { pattern: 'pubmatic.com', provider: 'PubMatic' },
  { pattern: 'openx.net', provider: 'OpenX' },
  { pattern: 'criteo.com', provider: 'Criteo' },
  { pattern: 'criteo.net', provider: 'Criteo' },
  { pattern: 'taboola.com', provider: 'Taboola' },
  { pattern: 'outbrain.com', provider: 'Outbrain' },
];

/**
 * Subdomain labels that almost always mean "this is a cloaked analytics endpoint".
 * A first-party site that genuinely serves assets from `/stats/` is rare; one that
 * CNAMEs `stats.` to a vendor is extremely common.
 */
export const CLOAKING_LABELS: readonly string[] = [
  'metrics',
  'metric',
  'analytics',
  'stats',
  'stat',
  'track',
  'tracking',
  'tracker',
  'telemetry',
  'pixel',
  'beacon',
  'collect',
  'insights',
  'measure',
  'tag',
  'tags',
  'log',
  'logs',
  'event',
  'events',
];

/** Which CNAME-cloaking provider a host belongs to, or null when it is not one. */
export function cloakProvider(host: string): string | null {
  if (!host) return null;
  const lower = host.toLowerCase();
  for (const { pattern, provider } of CNAME_CLOAK_PATTERNS) {
    if (lower === pattern || lower.endsWith(`.${pattern}`)) return provider;
  }
  return null;
}
