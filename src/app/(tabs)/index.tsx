import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { AddressBar } from '@/components/AddressBar';
import { HomeScreen } from '@/components/HomeScreen';
import { ShieldPanel } from '@/components/ShieldPanel';
import { TabBar } from '@/components/TabBar';
import { radius, spacing, useColors } from '@/constants/theme';
import { shouldBlock } from '@/lib/blocklist';
import { PURGE_SCRIPT, formatRefresh, refreshSeconds } from '@/lib/auto-refresh';
import {
  buildInjectionScript,
  buildProfile,
  newSeed,
  type FingerprintProfile,
} from '@/lib/fingerprint';
import { PROBE_SCRIPT, parseProbeMessage } from '@/lib/fingerprint-probe';
import { buildErrorPage, type LoadFailure } from '@/lib/error-page';
import { buildHeaderRules } from '@/lib/header-rules';
import { takeOpenRequest } from '@/lib/open-request';
import { alignToHost, applyPersona } from '@/lib/persona';
import { headerSettingsFrom, usePrivacySettings } from '@/lib/privacy-settings';
import { burnDelayMs, formatCountdown } from '@/lib/session-burn';
import {
  addBlockedHost,
  addCloaked,
  addStrippedParams,
  createTab,
  type Tab,
} from '@/lib/tab-isolation';
import {
  buildFollowerScript,
  buildLeaderScript,
  clampOpenCount,
  describeAction,
  isLeader,
  MIRROR_OFF,
  parseSyncAction,
  removeFromMirror,
  setLeader,
  startMirror,
  stopMirror,
  type MirrorState,
  type SyncAction,
} from '@/lib/tab-sync';
import { cloakProvider, stripTrackingParams } from '@/lib/tracking-params';
import { hostOf, isHttp, toHttps, toUrl } from '@/lib/url';

/** Script that wipes this tab's namespaced storage when the user asks for a clean slate. */
const WIPE_SCRIPT = PURGE_SCRIPT;

export default function BrowserScreen() {
  const colors = useColors();
  const [settings, , settingsStatus] = usePrivacySettings();

  const [tabs, setTabs] = useState<Tab[]>(() => [createTab()]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [seed, setSeed] = useState<string>(() => newSeed());
  const [addressFocused, setAddressFocused] = useState(false);
  const [burnRemaining, setBurnRemaining] = useState<number | null>(null);
  const [refreshRemaining, setRefreshRemaining] = useState<number | null>(null);
  const [mirror, setMirror] = useState<MirrorState>(MIRROR_OFF);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const webviews = useRef<Record<string, WebView | null>>({});

  // One profile per session. When per-tab fingerprinting is on, each tab derives its
  // own profile from the session seed plus its tab id, so two tabs never share an
  // identity — a site cannot link them even within one session.
  const sessionProfile: FingerprintProfile = useMemo(
    () => applyPersona(buildProfile(seed), settings.personaMode, seed),
    [seed, settings.personaMode],
  );
  const profileFor = useCallback(
    (tabId: string, host = ''): FingerprintProfile => {
      const base = settings.perTabFingerprint
        ? applyPersona(buildProfile(`${seed}:${tabId}`), settings.personaMode, `${seed}:${tabId}`)
        : sessionProfile;
      // A site under a national TLD must not see a browser claiming another continent's
      // timezone — that contradiction is a stronger signal than any single attribute.
      return settings.geoCoherentPersona && host ? alignToHost(base, host) : base;
    },
    [seed, sessionProfile, settings.perTabFingerprint, settings.personaMode, settings.geoCoherentPersona],
  );

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const activeProfile = useMemo(
    () => profileFor(active.id, hostOf(active.url)),
    [active.id, active.url, profileFor],
  );

  const patchTab = useCallback((id: string, patch: Partial<Tab> | ((t: Tab) => Tab)) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return typeof patch === 'function' ? patch(t) : { ...t, ...patch };
      }),
    );
  }, []);

  // ---- tab lifecycle ----
  const openUrl = useCallback(
    (raw: string) => {
      const target = toUrl(raw, settings.searchEngine);
      if (!target) return;
      const secure = settings.httpsOnly ? toHttps(target) : target;
      // Tracking identifiers ride in the URL, so they never reach the network at all —
      // not blocked after the fact, but removed before the request is made.
      const stripped = settings.stripTrackingParams
        ? stripTrackingParams(secure)
        : { url: secure, removed: [] };
      if (stripped.removed.length) {
        patchTab(activeId, (t) => addStrippedParams(t, stripped.removed));
      }
      patchTab(activeId, {
        url: stripped.url,
        loadUri: stripped.url,
        loadNonce: Date.now(),
        started: true,
        title: stripped.url,
        loading: true,
        probe: null,
      });
    },
    [activeId, patchTab, settings.httpsOnly, settings.searchEngine, settings.stripTrackingParams],
  );

  const newTab = useCallback(() => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }, []);

  // ---- open one URL in N tabs, each with its own identity ----
  //
  // Every tab gets a distinct id, and the fingerprint is derived from the session seed
  // plus that id (see profileFor), so the N tabs are N different people to the site: own
  // user agent, own canvas/WebGL noise, own screen, own timezone, own cookie jar
  // (incognito + per-tab purge). The URL is the same; the visitor is not.
  const openInTabs = useCallback(
    (raw: string, count: number) => {
      const target = toUrl(raw, settings.searchEngine);
      if (!target) return;
      const secure = settings.httpsOnly ? toHttps(target) : target;
      const stripped = settings.stripTrackingParams
        ? stripTrackingParams(secure)
        : { url: secure, removed: [] };
      const n = clampOpenCount(count);
      const fresh: Tab[] = [];
      for (let i = 0; i < n; i += 1) {
        const t = createTab();
        fresh.push({
          ...t,
          url: stripped.url,
          loadUri: stripped.url,
          loadNonce: Date.now() + i,
          started: true,
          title: stripped.url,
          loading: true,
          probe: null,
        });
      }
      setTabs((prev) => [...prev, ...fresh]);
      setActiveId(fresh[0].id);
      // Mirroring starts on by default: the user asked for N tabs of the same page, and
      // the point of that is to drive them together. It can be turned off in the bar.
      setMirror(startMirror(fresh.map((t) => t.id), 0));
      setLastAction(null);
    },
    [settings.httpsOnly, settings.searchEngine, settings.stripTrackingParams],
  );

  // ---- mirror: replay the leader's action into every follower ----
  const replayToFollowers = useCallback(
    (action: SyncAction) => {
      const script = buildFollowerScript(action);
      mirror.followerIds.forEach((id) => {
        const wv = webviews.current[id];
        if (!wv) return;
        try {
          wv.injectJavaScript(script);
        } catch {
          // A follower that is mid-navigation will get the next action.
        }
      });
      setLastAction(describeAction(action));
    },
    [mirror.followerIds],
  );

  const toggleMirror = useCallback(() => {
    setMirror((m) => (m.enabled ? stopMirror() : m));
  }, []);

  const makeLeader = useCallback((id: string) => {
    setMirror((m) => setLeader(m, id));
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        if (prev.length === 1) {
          // Never leave the browser with zero tabs: reset the last one instead.
          return [createTab()];
        }
        const next = prev.filter((t) => t.id !== id);
        if (id === activeId) setActiveId(next[next.length - 1].id);
        return next;
      });
      delete webviews.current[id];
      // A closed tab must leave the mirror group, or the leader would keep injecting
      // into a WebView that no longer exists and the group would silently stop working.
      setMirror((m) => removeFromMirror(m, id));
    },
    [activeId],
  );

  // ---- consume a multi-tab open request from Settings ----
  //
  // Settings cannot open tabs itself: the tabs live in this screen. It queues a request
  // and this screen takes it when it gains focus. `takeOpenRequest` clears the slot, so
  // the request fires exactly once and a stale one cannot re-open tabs on a later visit.
  useFocusEffect(
    useCallback(() => {
      const req = takeOpenRequest();
      if (req) openInTabs(req.url, req.count);
    }, [openInTabs]),
  );

  // ---- hardware back: page history first, then tab close ----
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (shieldOpen) {
        setShieldOpen(false);
        return true;
      }
      if (active.canGoBack) {
        webviews.current[active.id]?.goBack();
        return true;
      }
      if (tabs.length > 1) {
        closeTab(active.id);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [active.canGoBack, active.id, closeTab, shieldOpen, tabs.length]);

  // ---- clear everything ----
  const clearAll = useCallback(() => {
    Object.values(webviews.current).forEach((wv) => {
      try {
        wv?.injectJavaScript(WIPE_SCRIPT);
        wv?.clearCache(true);
      } catch {
        // A WebView that is already unmounted has nothing to clear.
      }
    });
    // A new seed means the next page load reports a different fingerprint.
    setSeed(newSeed());
    setTabs((prev) =>
      prev.map((t) => ({
        ...t,
        blocked: 0,
        blockedHosts: [],
        strippedParams: 0,
        strippedNames: [],
        cloaked: 0,
        probe: null,
      })),
    );
    setShieldOpen(false);
  }, []);

  // ---- identity rotation ----
  // A new seed means a new user agent, new canvas/WebGL/audio noise, new screen and
  // timezone. Nothing about the old identity survives it. This is the only way a return
  // visit looks like a different person, and it is why the auto-refresh below is a
  // rotation rather than a reload.
  const rotateIdentity = useCallback(() => {
    setSeed(newSeed());
  }, []);

  // ---- purge this tab before it goes away ----
  // Cookies, Storage, IndexedDB, Cache Storage and service workers live in the page's
  // origin, not in the native layer, so the page has to erase them itself. The native
  // clearCache() below cannot reach any of them.
  const purgeTab = useCallback((tabId: string) => {
    const wv = webviews.current[tabId];
    if (!wv) return;
    try {
      wv.injectJavaScript(PURGE_SCRIPT);
    } catch {
      // An unmounted WebView has nothing to purge.
    }
    try {
      wv.clearCache(true);
    } catch {
      // Same.
    }
  }, []);

  // ---- auto-refresh ----
  // Reload the active tab on the user's interval and mint a new identity each time, so
  // the next request cannot be tied to the previous one. Navigation history is kept:
  // this is a fresh visitor to the same page, not a forward navigation.
  useEffect(() => {
    const seconds = refreshSeconds(settings.autoRefresh);
    if (!seconds) {
      setRefreshRemaining(null);
      return;
    }
    const totalMs = seconds * 1000;
    let startedAt = Date.now();
    setRefreshRemaining(totalMs);
    const tick = setInterval(() => {
      const left = totalMs - (Date.now() - startedAt);
      if (left > 0) {
        setRefreshRemaining(left);
        return;
      }
      // Order matters: purge while the page still exists, rotate the identity, then
      // re-issue the load so the next request is made by the new persona. The nonce
      // bump is what makes the rotation real: a plain reload() keeps the injection
      // script that was already applied, so the site would see the OLD fingerprint
      // again. Remounting the WebView re-runs the injection with the new profile.
      startedAt = Date.now();
      setRefreshRemaining(totalMs);
      purgeTab(activeId);
      rotateIdentity();
      patchTab(activeId, (t) => ({ ...t, loadNonce: Date.now() }));
    }, 1000);
    return () => clearInterval(tick);
  }, [settings.autoRefresh, activeId, purgeTab, rotateIdentity, patchTab]);

  // ---- manual reload ----
  // With rotateOnReload on, a manual reload is also a new identity, so it goes through
  // the same remount path as the auto-refresh. With it off, a plain reload() is used,
  // which keeps the page's own history and scroll position.
  const reloadActive = useCallback(() => {
    if (settings.rotateOnReload) {
      purgeTab(activeId);
      rotateIdentity();
      patchTab(activeId, (t) => ({ ...t, loadNonce: Date.now() }));
      return;
    }
    const wv = webviews.current[activeId];
    if (wv) {
      try {
        wv.reload();
      } catch {
        // Nothing to reload.
      }
    }
  }, [activeId, patchTab, purgeTab, rotateIdentity, settings.rotateOnReload]);

  // ---- session burn timer ----
  // A hard ceiling on session lifetime, counted from the last reset. When it expires
  // every tab's data and fingerprint are destroyed, so a session left open all day
  // cannot accumulate a profile.
  useEffect(() => {
    const delay = burnDelayMs(settings.burnInterval);
    if (delay === null) {
      setBurnRemaining(null);
      return;
    }
    const startedAt = Date.now();
    setBurnRemaining(delay);
    const tick = setInterval(() => {
      const left = delay - (Date.now() - startedAt);
      if (left <= 0) {
        clearInterval(tick);
        setBurnRemaining(0);
        clearAll();
      } else {
        setBurnRemaining(left);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [settings.burnInterval, clearAll]);

  // ---- navigation gate: tracking-param stripping, tracker + CNAME blocking, HTTPS-only ----
  //
  // Every branch that rewrites a URL must return false AND set `loadUri`, because
  // returning false cancels the navigation the WebView was about to make. The first
  // version returned false and patched only `url` — the address bar changed, the
  // WebView never loaded anything, and the page appeared to "go somewhere else" or
  // hang. Setting `loadUri` is what actually performs the rewritten navigation.
  //
  // The nonce must be bumped in the same patch. If the rewritten URL happens to equal
  // the one already in `loadUri`, React sees an identical `source` prop and the WebView
  // does nothing at all: the navigation was cancelled and nothing replaced it, so the
  // page simply hangs. A fresh nonce forces the load.
  const onShouldStart = useCallback(
    (url: string): boolean => {
      if (!/^https?:/i.test(url)) return true; // about:, data:, blob: — let the WebView handle it
      if (settings.httpsOnly && isHttp(url)) {
        // Upgrade in place rather than blocking, so the page still loads securely.
        const upgraded = toHttps(url);
        const clean = settings.stripTrackingParams
          ? stripTrackingParams(upgraded).url
          : upgraded;
        patchTab(activeId, { url: clean, loadUri: clean, loadNonce: Date.now() });
        return false;
      }
      if (settings.stripTrackingParams) {
        const { url: clean, removed } = stripTrackingParams(url);
        if (removed.length) {
          patchTab(activeId, (t) => addStrippedParams(t, removed));
          patchTab(activeId, { url: clean, loadUri: clean, loadNonce: Date.now() });
          return false;
        }
      }
      const host = hostOf(url);
      // CNAME-cloaked analytics looks first-party, so it is checked before the
      // domain blocklist — otherwise it sails straight through.
      if (settings.blockCnameCloaking && cloakProvider(host)) {
        patchTab(activeId, (t) => addCloaked(t));
        return false;
      }
      if (shouldBlock(url)) {
        patchTab(activeId, (t) => addBlockedHost(t, host));
        return false;
      }
      return true;
    },
    [activeId, patchTab, settings.httpsOnly, settings.stripTrackingParams, settings.blockCnameCloaking],
  );

  const onNavChange = useCallback(
    (nav: WebViewNavigation) => {
      patchTab(activeId, {
        url: nav.url,
        title: nav.title || nav.url,
        canGoBack: nav.canGoBack,
        canGoForward: nav.canGoForward,
        loading: nav.loading,
      });
    },
    [activeId, patchTab],
  );

  // The header rules are applied to every request the WebView makes.
  const headerRules = useMemo(
    () => buildHeaderRules(headerSettingsFrom(settings)),
    [settings],
  );

  // ---- live probe ----
  // Run the measuring script inside the active tab. It reports what the page actually
  // sees, which is the only way to know whether the armor is really on.
  const runProbe = useCallback(() => {
    const target = webviews.current[activeId];
    if (!target) return;
    patchTab(activeId, { probing: true });
    try {
      target.injectJavaScript(PROBE_SCRIPT);
    } catch {
      patchTab(activeId, { probing: false });
    }
  }, [activeId, patchTab]);

  const onMessage = useCallback(
    (tabId: string, raw: string) => {
      // Mirror actions arrive on the same channel as the probe. They are tried first
      // because a mirror payload is small and frequent, and a probe payload is neither.
      const action = parseSyncAction(raw);
      if (action) {
        // Only the leader's actions are replayed. A follower that somehow reported one
        // is ignored, which is the second half of the loop guard (the first is that the
        // follower script never installs the leader's listeners).
        if (isLeader(mirror, tabId)) replayToFollowers(action);
        return;
      }
      const parsed = parseProbeMessage(raw);
      if (!parsed) return;
      if (parsed.kind === 'probe') {
        patchTab(tabId, { probe: parsed.result, probing: false });
      } else if (parsed.kind === 'blocked') {
        patchTab(tabId, (t) => addBlockedHost(t, parsed.host));
      }
    },
    [patchTab, mirror, replayToFollowers],
  );

  // ---- load failure ----
  // A failed load used to leave the tab blank, which is why "the page will not load" was
  // indistinguishable from "the app is broken". Now the tab shows a real error page with
  // the address, the reason code and a retry button.
  const onLoadError = useCallback(
    (tabId: string, failure: LoadFailure) => {
      patchTab(tabId, {
        loading: false,
        error: failure,
        errorPage: buildErrorPage(failure, true),
      });
    },
    [patchTab],
  );

  // Probe once per page load, automatically: a privacy tool that only measures when you
  // remember to press a button hides its own failures.
  const onLoadEndFor = useCallback(
    (tabId: string) => {
      // A successful load clears any error page from a previous attempt, so a retry that
      // works does not leave the error behind it.
      patchTab(tabId, { loading: false, error: null, errorPage: null });
      if (!settings.liveProbe) return;
      const target = webviews.current[tabId];
      if (!target) return;
      patchTab(tabId, { probing: true });
      try {
        target.injectJavaScript(PROBE_SCRIPT);
      } catch {
        patchTab(tabId, { probing: false });
      }
    },
    [patchTab, settings.liveProbe],
  );

  if (settingsStatus === 'loading') {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}>
      {/* top chrome */}
      <View style={styles.chrome}>
        <TabBar
          tabs={tabs}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={closeTab}
          onNew={newTab}
        />
        <View style={styles.addressRow}>
          <View style={styles.addressFlex}>
            <AddressBar
              url={active.url}
              insecure={isHttp(active.url)}
              httpsOnly={settings.httpsOnly}
              onSubmit={openUrl}
              onFocusChange={setAddressFocused}
            />
          </View>
          <Pressable
            onPress={() => setShieldOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open protection panel"
            style={({ pressed }) => [
              styles.shieldButton,
              { backgroundColor: colors.successSoft, borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons name="shield-checkmark" size={19} color={colors.success} />
            {active.blocked > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.success }]}>
                <Text style={[styles.badgeText, { color: colors.onPrimary }]}>
                  {active.blocked > 99 ? '99+' : active.blocked}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        {burnRemaining !== null ? (
          <View style={styles.burnRow}>
            <Ionicons name="flame-outline" size={12} color={colors.warn} />
            <Text style={[styles.burnText, { color: colors.warn }]}>
              Session burns in {formatCountdown(burnRemaining)}
            </Text>
          </View>
        ) : null}
        {refreshRemaining !== null ? (
          <View style={styles.burnRow}>
            <Ionicons name="sync-outline" size={12} color={colors.muted} />
            <Text style={[styles.burnText, { color: colors.muted }]}>
              New identity in {formatCountdown(refreshRemaining)} ({formatRefresh(settings.autoRefresh)})
            </Text>
          </View>
        ) : null}
        {mirror.enabled ? (
          <View style={[styles.mirrorRow, { borderColor: colors.border }]}>
            <Ionicons name="git-compare-outline" size={13} color={colors.primary} />
            <Text style={[styles.mirrorText, { color: colors.primary }]} numberOfLines={1}>
              Mirroring {mirror.followerIds.length + 1} tabs
              {lastAction ? ` · ${lastAction}` : ''}
            </Text>
            <Pressable
              onPress={() => makeLeader(activeId)}
              disabled={isLeader(mirror, activeId)}
              hitSlop={6}
              accessibilityLabel="Make this tab the leader"
              style={[styles.mirrorBtn, { borderColor: colors.border }]}>
              <Text
                style={[
                  styles.mirrorBtnText,
                  { color: isLeader(mirror, activeId) ? colors.muted : colors.text },
                ]}>
                {isLeader(mirror, activeId) ? 'Leader' : 'Lead'}
              </Text>
            </Pressable>
            <Pressable
              onPress={toggleMirror}
              hitSlop={6}
              accessibilityLabel="Stop mirroring"
              style={[styles.mirrorBtn, { borderColor: colors.border }]}>
              <Text style={[styles.mirrorBtnText, { color: colors.text }]}>Stop</Text>
            </Pressable>
          </View>
        ) : null}
        {active.loading ? (
          <View style={[styles.progress, { backgroundColor: colors.primarySoft }]}>
            <View style={[styles.progressBar, { backgroundColor: colors.primary }]} />
          </View>
        ) : null}
      </View>

      {/* content */}
      <View style={styles.content}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          if (!tab.started) {
            return isActive ? (
              <HomeScreen
                key={tab.id}
                onOpen={openUrl}
                onOpenShield={() => setShieldOpen(true)}
              />
            ) : null;
          }
          const tabProfile = profileFor(tab.id, hostOf(tab.url));
          const injection = settings.randomizeFingerprint
            ? buildInjectionScript(tabProfile, tab.id, {
                blockWebRtc: settings.blockWebRtcLeak,
                coarsenTimers: settings.coarsenTimers,
              })
            : '';
          // The mirror scripts ride on the same injection channel as the fingerprint.
          // The leader reports what the user does; a follower replays what it is told.
          // A tab is never both, which is what keeps the replay from looping.
          const mirrorScript = isLeader(mirror, tab.id)
            ? buildLeaderScript()
            : '';
          const combinedInjection = `${injection}\n${mirrorScript}`;
          // Headers applied to the main document request. GPC is a real opt-out signal;
          // a null value means the header is omitted entirely.
          const requestHeaders: Record<string, string> = {};
          headerRules.forEach((rule) => {
            if (rule.value !== null) requestHeaders[rule.name] = rule.value;
          });
          return (
            <View
              key={tab.id}
              style={[StyleSheet.absoluteFill, { opacity: isActive ? 1 : 0 }]}
              pointerEvents={isActive ? 'auto' : 'none'}>
              <WebView
                // The nonce is part of the key on purpose: bumping it remounts the
                // WebView, which is the only way a rotated fingerprint is actually
                // applied (the injection script runs once per document).
                key={`${tab.id}:${tab.loadNonce}`}
                ref={(r) => {
                  webviews.current[tab.id] = r;
                }}
                source={{ uri: tab.errorPage ?? tab.loadUri, headers: requestHeaders }}
                // incognito: nothing is written to the app's persistent cookie jar, so
                // closing the tab discards its cookies and cache.
                incognito
                cacheEnabled={false}
                sharedCookiesEnabled={false}
                thirdPartyCookiesEnabled={!settings.blockThirdPartyCookies}
                domStorageEnabled
                javaScriptEnabled
                setSupportMultipleWindows={false}
                userAgent={settings.randomizeFingerprint ? tabProfile.userAgent : undefined}
                injectedJavaScriptBeforeContentLoaded={combinedInjection}
                injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
                // Header rules: GPC opt-out, no referrer, no client hints.
                onShouldStartLoadWithRequest={(req) => onShouldStart(req.url)}
                onNavigationStateChange={isActive ? onNavChange : undefined}
                onLoadStart={() => patchTab(tab.id, { loading: true })}
                onLoadEnd={() => onLoadEndFor(tab.id)}
                // A failed load shows a real error page instead of a blank tab. The
                // WebView's own error event carries the code and description; an HTTP
                // error carries a status instead, and both are handled.
                onError={(e) => {
                  const n = e.nativeEvent;
                  onLoadError(tab.id, {
                    url: n.url || tab.loadUri,
                    code: n.code ? String(n.code) : 'unknown',
                    description: n.description || '',
                  });
                }}
                onHttpError={(e) => {
                  const n = e.nativeEvent;
                  // 4xx/5xx still rendered a body, so only surface the ones that leave
                  // the user with nothing useful: 403 and 5xx.
                  if (n.statusCode >= 500 || n.statusCode === 403) {
                    onLoadError(tab.id, {
                      url: n.url || tab.loadUri,
                      code: `HTTP_${n.statusCode}`,
                      description: n.description || '',
                      status: n.statusCode,
                    });
                  }
                }}
                onMessage={(e) => onMessage(tab.id, e.nativeEvent.data)}
                style={{ backgroundColor: colors.background }}
              />
            </View>
          );
        })}
      </View>

      {/* bottom nav */}
      {!addressFocused ? (
        <View
          style={[styles.nav, { backgroundColor: colors.chrome, borderColor: colors.chromeBorder }]}>
          <Pressable
            onPress={() => webviews.current[active.id]?.goBack()}
            disabled={!active.canGoBack}
            hitSlop={8}
            accessibilityLabel="Back"
            style={styles.navButton}>
            <Ionicons
              name="chevron-back"
              size={24}
              color={active.canGoBack ? colors.text : colors.border}
            />
          </Pressable>
          <Pressable
            onPress={() => webviews.current[active.id]?.goForward()}
            disabled={!active.canGoForward}
            hitSlop={8}
            accessibilityLabel="Forward"
            style={styles.navButton}>
            <Ionicons
              name="chevron-forward"
              size={24}
              color={active.canGoForward ? colors.text : colors.border}
            />
          </Pressable>
          <Pressable
            onPress={reloadActive}
            hitSlop={8}
            accessibilityLabel="Reload"
            style={styles.navButton}>
            <Ionicons name="refresh" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => patchTab(active.id, { url: '', loadUri: '', loadNonce: Date.now(), started: false, title: 'New tab' })}
            hitSlop={8}
            accessibilityLabel="Home"
            style={styles.navButton}>
            <Ionicons name="home-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => setShieldOpen(true)}
            hitSlop={8}
            accessibilityLabel="Protection"
            style={styles.navButton}>
            <Ionicons name="options-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      ) : null}

      <ShieldPanel
        visible={shieldOpen}
        tab={active}
        profile={activeProfile}
        settings={settings}
        headerRules={headerRules}
        burnRemaining={burnRemaining}
        onClose={() => setShieldOpen(false)}
        onClear={clearAll}
        onProbe={runProbe}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chrome: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addressFlex: { flex: 1 },
  shieldButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  burnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  burnText: { fontSize: 11, fontWeight: '600' },
  mirrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mirrorText: { fontSize: 11, flex: 1 },
  mirrorBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mirrorBtnText: { fontSize: 11, fontWeight: '600' },
  progress: { height: 2, borderRadius: 1, overflow: 'hidden' },
  progressBar: { width: '45%', height: 2 },
  content: { flex: 1, marginTop: spacing.sm },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.md,
  },
  navButton: { padding: spacing.sm, minWidth: 44, alignItems: 'center' },
});
