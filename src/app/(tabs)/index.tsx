import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  buildInjectionScript,
  buildProfile,
  newSeed,
  type FingerprintProfile,
} from '@/lib/fingerprint';
import { buildHeaderRules } from '@/lib/header-rules';
import { headerSettingsFrom, usePrivacySettings } from '@/lib/privacy-settings';
import { burnDelayMs, formatCountdown } from '@/lib/session-burn';
import { addBlockedHost, createTab, type Tab } from '@/lib/tab-isolation';
import { hostOf, isHttp, toHttps, toUrl } from '@/lib/url';

/** Script that wipes this tab's namespaced storage when the user asks for a clean slate. */
const WIPE_SCRIPT = `(function(){
  try { localStorage.clear(); } catch(e){}
  try { sessionStorage.clear(); } catch(e){}
  try {
    if (window.indexedDB && indexedDB.databases) {
      indexedDB.databases().then(function(dbs){
        dbs.forEach(function(d){ try { indexedDB.deleteDatabase(d.name); } catch(e){} });
      });
    }
  } catch(e){}
  try {
    if (window.caches && caches.keys) {
      caches.keys().then(function(keys){ keys.forEach(function(k){ caches.delete(k); }); });
    }
  } catch(e){}
  true;
})();`;

export default function BrowserScreen() {
  const colors = useColors();
  const [settings, , settingsStatus] = usePrivacySettings();

  const [tabs, setTabs] = useState<Tab[]>(() => [createTab()]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [seed, setSeed] = useState<string>(() => newSeed());
  const [addressFocused, setAddressFocused] = useState(false);
  const [burnRemaining, setBurnRemaining] = useState<number | null>(null);

  const webviews = useRef<Record<string, WebView | null>>({});

  // One profile per session. When per-tab fingerprinting is on, each tab derives its
  // own profile from the session seed plus its tab id, so two tabs never share an
  // identity — a site cannot link them even within one session.
  const sessionProfile: FingerprintProfile = useMemo(() => buildProfile(seed), [seed]);
  const profileFor = useCallback(
    (tabId: string): FingerprintProfile =>
      settings.perTabFingerprint ? buildProfile(`${seed}:${tabId}`) : sessionProfile,
    [seed, sessionProfile, settings.perTabFingerprint],
  );

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const activeProfile = useMemo(() => profileFor(active.id), [active.id, profileFor]);

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
      const finalUrl = settings.httpsOnly ? toHttps(target) : target;
      patchTab(activeId, { url: finalUrl, started: true, title: finalUrl, loading: true });
    },
    [activeId, patchTab, settings.httpsOnly, settings.searchEngine],
  );

  const newTab = useCallback(() => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
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
    },
    [activeId],
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
    setTabs((prev) => prev.map((t) => ({ ...t, blocked: 0, blockedHosts: [] })));
    setShieldOpen(false);
  }, []);

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

  // ---- navigation gate: tracker blocking + HTTPS-only ----
  const onShouldStart = useCallback(
    (url: string): boolean => {
      if (!/^https?:/i.test(url)) return true; // about:, data:, blob: — let the WebView handle it
      if (settings.httpsOnly && isHttp(url)) {
        // Upgrade in place rather than blocking, so the page still loads securely.
        patchTab(activeId, { url: toHttps(url) });
        return false;
      }
      if (shouldBlock(url)) {
        const host = hostOf(url);
        patchTab(activeId, (t) => addBlockedHost(t, host));
        return false;
      }
      return true;
    },
    [activeId, patchTab, settings.httpsOnly],
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
          const tabProfile = profileFor(tab.id);
          const injection = settings.randomizeFingerprint
            ? buildInjectionScript(tabProfile, tab.id, {
                blockWebRtc: settings.blockWebRtcLeak,
                coarsenTimers: settings.coarsenTimers,
              })
            : '';
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
                ref={(r) => {
                  webviews.current[tab.id] = r;
                }}
                source={{ uri: tab.url, headers: requestHeaders }}
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
                injectedJavaScriptBeforeContentLoaded={injection}
                injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
                // Header rules: GPC opt-out, no referrer, no client hints.
                onShouldStartLoadWithRequest={(req) => onShouldStart(req.url)}
                onNavigationStateChange={isActive ? onNavChange : undefined}
                onLoadStart={() => patchTab(tab.id, { loading: true })}
                onLoadEnd={() => patchTab(tab.id, { loading: false })}
                onError={() => patchTab(tab.id, { loading: false })}
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
            onPress={() => webviews.current[active.id]?.reload()}
            hitSlop={8}
            accessibilityLabel="Reload"
            style={styles.navButton}>
            <Ionicons name="refresh" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => patchTab(active.id, { url: '', started: false, title: 'New tab' })}
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
