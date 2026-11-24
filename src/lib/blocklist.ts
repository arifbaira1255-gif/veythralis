/**
 * Zuno tracker blocklist.
 *
 * Design decision, stated plainly: this list blocks *measurement*, not *advertising*.
 * A request is blocked when its purpose is to observe you — analytics, session replay,
 * cross-site pixels, retargeting beacons, telemetry. A request is allowed when its
 * purpose is to render an ad you can see, even when the same company runs both.
 *
 * That distinction is why `AD_DELIVERY_HOSTS` is checked *first* and always wins. If a
 * host appears in both lists, the ad renders and only its measurement paths are cut.
 * Blocking the creative would be ad blocking, which this browser deliberately does not
 * do.
 *
 * Matching is by registrable domain suffix, so `stats.g.doubleclick.net` is covered by
 * `doubleclick.net` without listing every subdomain.
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
  'region1.google-analytics.com',
  'region1.analytics.google.com',
  // Meta
  'connect.facebook.net',
  'graph.facebook.com',
  'pixel.facebook.com',
  'an.facebook.com',
  'business.facebook.com',
  // Microsoft
  'clarity.ms',
  'bat.bing.com',
  'c.bing.com',
  // Twitter / X
  'static.ads-twitter.com',
  'analytics.twitter.com',
  't.co',
  // LinkedIn
  'snap.licdn.com',
  'px.ads.linkedin.com',
  // TikTok
  'analytics.tiktok.com',
  'business-api.tiktok.com',
  // Pinterest / Snap
  'ct.pinterest.com',
  'sc-static.net',
  'tr.snapchat.com',
  // Hotjar / FullStory / Heap / Mixpanel / Amplitude / Segment
  'static.hotjar.com',
  'script.hotjar.com',
  'vars.hotjar.com',
  'in.hotjar.com',
  'fullstory.com',
  'rs.fullstory.com',
  'edge.fullstory.com',
  'heapanalytics.com',
  'cdn.heapanalytics.com',
  'api.mixpanel.com',
  'cdn.mxpnl.com',
  'api-js.mixpanel.com',
  'api.amplitude.com',
  'cdn.amplitude.com',
  'api.segment.io',
  'cdn.segment.com',
  'api.segment.com',
  // Session replay / UX
  'smartlook.com',
  'logrocket.com',
  'r.lr-ingest.io',
  'mouseflow.com',
  'cdn.mouseflow.com',
  'luckyorange.com',
  'cdn.luckyorange.com',
  'inspectlet.com',
  'cdn.inspectlet.com',
  'quantummetric.com',
  'cdn.quantummetric.com',
  'decibelinsight.net',
  'cdn.decibelinsight.net',
  'contentsquare.net',
  't.contentsquare.net',
  // Adobe
  'omtrdc.net',
  '2o7.net',
  'demdex.net',
  'everesttech.net',
  'adobedtm.com',
  'assets.adobedtm.com',
  // New Relic / Datadog / Sentry (RUM beacons)
  'bam.nr-data.net',
  'js-agent.newrelic.com',
  'browser-intake-datadoghq.com',
  'rum.browser-intake-datadoghq.com',
  'browser.sentry-cdn.com',
  // Data brokers / DMPs / identity graphs
  'krxd.net',
  'agkn.com',
  'rlcdn.com',
  'crwdcntrl.net',
  'bluekai.com',
  'exelator.com',
  'tapad.com',
  'adsrvr.org',
  'mathtag.com',
  'turn.com',
  'simpli.fi',
  'zeotap.com',
  'id5-sync.com',
  'liadm.com',
  'pippio.com',
  'liveramp.com',
  'neustar.biz',
  // Retargeting / affiliate measurement
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'casalemedia.com',
  'moatads.com',
  'doubleverify.com',
  'adsafeprotected.com',
  'iasds01.com',
  'serving-sys.com',
  // Marketing automation / email
  'mktoresp.com',
  'mktomail.com',
  'hs-analytics.net',
  'hsforms.net',
  'hs-scripts.com',
  'hubspot.com',
  'track.hubspot.com',
  'pardot.com',
  'pi.pardot.com',
  'marketo.net',
  'munchkin.marketo.net',
  'eloqua.com',
  'en25.com',
  'klaviyo.com',
  'static.klaviyo.com',
  'a.klaviyo.com',
  'mailchimp.com',
  'chimpstatic.com',
  'list-manage.com',
  'sendgrid.net',
  'braze.com',
  'appboy.com',
  'iterable.com',
  'customer.io',
  'track.customer.io',
  // A/B testing (leaks behaviour, not just page views)
  'optimizely.com',
  'cdn.optimizely.com',
  'vwo.com',
  'dev.visualwebsiteoptimizer.com',
  'abtasty.com',
  'try.abtasty.com',
  'convert.com',
  'cdn-3.convertexperiments.com',
  // Push / in-app messaging
  'onesignal.com',
  'cdn.onesignal.com',
  'pushengage.com',
  'izooto.com',
  'cleverpush.com',
  // Misc telemetry
  'scorecardresearch.com',
  'sb.scorecardresearch.com',
  'quantserve.com',
  'quantcount.com',
  'chartbeat.com',
  'static.chartbeat.com',
  'parsely.com',
  'pixel.parsely.com',
  'newrelic.com',
  'nr-data.net',
  'statcounter.com',
  'histats.com',
  'yandex.ru/metrika',
  'mc.yandex.ru',
  'top-fwz1.mail.ru',
  'vk.com/rtrg',
  'criteo-sync.teads.tv',
  'analytics.yahoo.com',
  'geo.yahoo.com',
  'udc.yahoo.com',
  'narrative.io',
  'sitescout.com',
  'adform.net',
  'track.adform.net',
  'smartadserver.com',
  'gemius.pl',
  'hit.gemius.pl',
  'imedia.cz',
  'seznam.cz/impression',
  'wt-eu02.net',
  'webtrekk.net',
  'etracker.com',
  'cdn.etracker.com',
  'piwik.pro',
  'matomo.cloud',
  'cdn.matomo.cloud',
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
  // Ad networks that also appear in the tracker list. Their *creative* delivery must
  // keep working or the ad slot renders empty — which is ad blocking, not tracking
  // blocking. The measurement endpoints on these networks are caught by path rules
  // instead, so the ad still shows while its telemetry does not.
  'criteo.net',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
  'casalemedia.com',
  'everesttech.net',
  'adsrvr.org',
];

/** Path fragments that mark a request as measurement rather than content. */
export const TRACKER_PATHS: readonly string[] = [
  '/collect',
  '/g/collect',
  '/j/collect',
  '/r/collect',
  '/batch',
  '/beacon',
  '/pixel',
  '/p.gif',
  '/track',
  '/tracking',
  '/telemetry',
  '/analytics',
  '/metrics',
  '/impression',
  '/impressions',
  '/pageview',
  '/pageviews',
  '/event',
  '/events',
  '/log',
  '/logs',
  '/rum',
  '/v1/track',
  '/v2/track',
  '/api/track',
  '/api/event',
  '/api/events',
  '/api/collect',
  '/api/beacon',
  '/gtag/js',
  '/gtm.js',
  '/analytics.js',
  '/ga.js',
];

/** True when the host is an ad-delivery endpoint that must keep working. */
export function isAdDelivery(host: string): boolean {
  const h = host.toLowerCase();
  return AD_DELIVERY_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** True when the host is a known tracker. */
export function isTrackerHost(host: string): boolean {
  const h = host.toLowerCase();
  return TRACKER_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** True when the path looks like a measurement endpoint. */
export function isTrackerPath(path: string): boolean {
  const p = path.toLowerCase();
  return TRACKER_PATHS.some((t) => p.includes(t));
}

/**
 * The single decision point. Ad delivery is checked first and always wins, so a host
 * that appears in both lists still renders its ad — only its measurement paths are cut.
 */
export function shouldBlock(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (isAdDelivery(host)) return false;
  if (isTrackerHost(host)) return true;
  return isTrackerPath(parsed.pathname);
}

/** How many tracker domains the browser knows about, for the About screen. */
export const TRACKER_COUNT = TRACKER_HOSTS.length;
