/**
 * Veythralis tracker blocklist.
 *
 * Design decision, stated plainly: this list blocks *tracking* endpoints — analytics,
 * telemetry, session replay, cross-site pixels and retargeting beacons — and it
 * deliberately does NOT block ad *delivery* domains. Ads therefore still render; what
 * stops is the measurement and profiling around them.
 *
 * Matching is by hostname suffix, so `www.google-analytics.com` matches
 * `google-analytics.com`.
 */

/** Analytics, telemetry, session replay, cross-site pixels, retargeting beacons. */
export const TRACKER_HOSTS: readonly string[] = [
  // Google analytics / tag manager / ads measurement
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'googletagservices.com',
  'ssl.google-analytics.com',
  'stats.g.doubleclick.net',
  'googleadservices.com',
  'google-analytics.l.google.com',
  // Meta pixel + conversions
  'connect.facebook.net',
  'pixel.facebook.com',
  'analytics.facebook.com',
  'graph.facebook.com',
  // Product analytics
  'segment.io',
  'segment.com',
  'api.segment.io',
  'mixpanel.com',
  'api.mixpanel.com',
  'amplitude.com',
  'api.amplitude.com',
  'heap.io',
  'heapanalytics.com',
  'posthog.com',
  'app.posthog.com',
  'plausible.io',
  'umami.is',
  'matomo.cloud',
  'statcounter.com',
  'quantserve.com',
  'quantcount.com',
  'scorecardresearch.com',
  'chartbeat.com',
  'chartbeat.net',
  'parsely.com',
  'newrelic.com',
  'nr-data.net',
  'bugsnag.com',
  'sentry.io',
  'datadoghq-browser-agent.com',
  'logrocket.com',
  'logrocket.io',
  'lr-ingest.io',
  'smartlook.com',
  'fullstory.com',
  'fs.fullstory.com',
  'inspectlet.com',
  'mouseflow.com',
  'crazyegg.com',
  'clarity.ms',
  'hotjar.com',
  'hotjar.io',
  'static.hotjar.com',
  'vwo.com',
  'visualwebsiteoptimizer.com',
  'optimizely.com',
  'cdn.optimizely.com',
  'abtasty.com',
  'kissmetrics.com',
  'hubspot.com',
  'hs-analytics.net',
  'hs-scripts.com',
  'hsforms.net',
  'hsleadflows.net',
  'marketo.net',
  'mktoresp.com',
  'pardot.com',
  'eloqua.com',
  'demdex.net',
  'omtrdc.net',
  'everesttech.net',
  '2o7.net',
  'adobedtm.com',
  'tealiumiq.com',
  'krxd.net',
  'bluekai.com',
  'exelator.com',
  'agkn.com',
  'rlcdn.com',
  'tapad.com',
  'crwdcntrl.net',
  'mathtag.com',
  'turn.com',
  'adsrvr.org',
  'casalemedia.com',
  'bidswitch.net',
  'liadm.com',
  'pippio.com',
  'zeotap.com',
  'id5-sync.com',
  'liveramp.com',
  'narrative.io',
  'sharethis.com',
  'addthis.com',
  'disqus.com',
  'onesignal.com',
  'pushwoosh.com',
  'airship.com',
  'braze.com',
  'appboy.com',
  'iterable.com',
  'klaviyo.com',
  'mailchimp.com',
  'list-manage.com',
  'sendgrid.net',
  'customer.io',
  'moengage.com',
  'clevertap.com',
  'appsflyer.com',
  'adjust.com',
  'branch.io',
  'kochava.com',
  'singular.net',
  'tenjin.io',
  'yandex.ru/metrika',
  'mc.yandex.ru',
  'top-fwz1.mail.ru',
  'vk.com/rtrg',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'zemanta.com',
  'mgid.com',
  'revcontent.com',
  'adroll.com',
  'quora.com/qevent',
  'bat.bing.com',
  'clarity.microsoft.com',
  'snap.licdn.com',
  'px.ads.linkedin.com',
  'ads.linkedin.com',
  'analytics.tiktok.com',
  'business-api.tiktok.com',
  'analytics.twitter.com',
  'static.ads-twitter.com',
  't.co/i/adsct',
  'sc-static.net',
  'tr.snapchat.com',
  'analytics.pinterest.com',
  'ct.pinterest.com',
  's.pinimg.com/ct',
];

/**
 * Ad *delivery* hosts that must keep working so ads still appear. Listed only so the
 * guard can skip them explicitly even if a path rule would otherwise match.
 */
export const AD_DELIVERY_HOSTS: readonly string[] = [
  'doubleclick.net',
  'googlesyndication.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'smartadserver.com',
  '33across.com',
  'gumgum.com',
  'media.net',
  'moatads.com',
  'serving-sys.com',
  'flashtalking.com',
  'innovid.com',
  'spotxchange.com',
  'teads.tv',
  'yieldmo.com',
  'sharethrough.com',
  'triplelift.com',
  'indexww.com',
  'sovrn.com',
  'lijit.com',
  'contextweb.com',
  'districtm.io',
  'adtelligent.com',
  'loopme.me',
  'smaato.net',
  'mopub.com',
  'applovin.com',
  'unityads.unity3d.com',
  'ironsrc.com',
  'vungle.com',
  'chartboost.com',
  'inmobi.com',
  'startappservice.com',
  'adcolony.com',
];

/** Path fragments that mark a request as measurement rather than content. */
export const TRACKER_PATHS: readonly string[] = [
  '/collect',
  '/g/collect',
  '/j/collect',
  '/beacon',
  '/beacons',
  '/pixel',
  '/pixels',
  '/track',
  '/tracking',
  '/telemetry',
  '/analytics',
  '/gtag/js',
  '/gtm.js',
  '/gtag/destination',
  '/tr?',
  '/i/adsct',
  '/rtrg',
  '/metrika',
  '/qevent',
  '/pageview',
  '/impression',
  '/event?',
  '/events?',
  '/log?',
  '/log/',
  '/metrics',
  '/rum',
  '/sentry',
  '/ingest',
  '/batch/',
  '/v1/track',
  '/v2/track',
];

function hostMatches(host: string, entry: string): boolean {
  // Entries may carry a path (e.g. "yandex.ru/metrika"); compare the host part only.
  const bare = entry.split('/')[0];
  return host === bare || host.endsWith(`.${bare}`);
}

export function isAdDelivery(host: string): boolean {
  return AD_DELIVERY_HOSTS.some((entry) => hostMatches(host, entry));
}

export function isTrackerHost(host: string): boolean {
  if (!host) return false;
  if (isAdDelivery(host)) return false;
  return TRACKER_HOSTS.some((entry) => hostMatches(host, entry));
}

export function isTrackerPath(path: string): boolean {
  const p = path.toLowerCase();
  return TRACKER_PATHS.some((frag) => p.includes(frag));
}

/**
 * Decide whether a request should be blocked. Ad delivery always wins, so a creative
 * from an ad network is never blocked even when its path looks like measurement.
 */
export function shouldBlock(url: string): boolean {
  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname + u.search;
  } catch {
    return false;
  }
  if (!host) return false;
  if (isAdDelivery(host)) return false;
  if (isTrackerHost(host)) return true;
  // A generic path rule only applies to third-party-looking hosts, never to the page's
  // own origin, so a site's own /analytics page still loads.
  return isTrackerPath(path) && /(^|\.)(analytics|track|tracker|telemetry|metrics|beacon|pixel|stats|collect)/.test(host);
}

export const TRACKER_COUNT = TRACKER_HOSTS.length;
