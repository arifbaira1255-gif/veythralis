import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ConfirmDialog } from '@/components/ui';
import { BRAND, radius, spacing, useColors } from '@/constants/theme';
import { TRACKER_COUNT } from '@/lib/blocklist';
import { DOH_ENDPOINT, usePrivacySettings, type PrivacySettings } from '@/lib/privacy-settings';
import { BURN_OPTIONS, type BurnInterval } from '@/lib/session-burn';
import { SEARCH_ENGINES, type SearchEngine } from '@/lib/url';

/**
 * The settings that are genuinely on/off, derived from PrivacySettings rather than
 * listed by hand. A hand-written Omit list silently rots: `autoRefresh` and `exit` are
 * pickers, not switches, and when they were added the Omit was not updated, so a Switch
 * was handed a RefreshInterval / ExitKind and the build failed type-check. Deriving the
 * keys from the value type means a new picker can never be wired to a Switch again.
 */
type BooleanSettingKey = {
  [K in keyof PrivacySettings]: PrivacySettings[K] extends boolean ? K : never;
}[keyof PrivacySettings];

type ToggleKey = {
  key: BooleanSettingKey;
  title: string;
  detail: string;
  icon:
    | 'lock-closed-outline'
    | 'globe-outline'
    | 'link-outline'
    | 'shield-outline'
    | 'finger-print-outline'
    | 'trash-outline'
    | 'hand-left-outline'
    | 'git-network-outline'
    | 'time-outline'
    | 'albums-outline'
    | 'cut-outline'
    | 'eye-outline'
    | 'compass-outline'
    | 'scan-outline';
};

const TOGGLES: ToggleKey[] = [
  {
    key: 'httpsOnly',
    title: 'HTTPS-only mode',
    detail: 'Upgrade every http:// page to https:// and refuse plain-http loads.',
    icon: 'lock-closed-outline',
  },
  {
    key: 'dnsOverHttps',
    title: 'DNS over HTTPS',
    detail: `Resolve names through ${DOH_ENDPOINT.replace('https://', '')} so your network cannot see them.`,
    icon: 'globe-outline',
  },
  {
    key: 'blockReferrer',
    title: 'Strip referrer',
    detail: 'Send no referrer header, so sites do not learn where you came from.',
    icon: 'link-outline',
  },
  {
    key: 'blockThirdPartyCookies',
    title: 'Block third-party cookies',
    detail: 'Refuse cookies set by a different site than the one you are visiting.',
    icon: 'shield-outline',
  },
  {
    key: 'randomizeFingerprint',
    title: 'Randomize fingerprint',
    detail:
      'Report a fresh canvas, WebGL, audio, font, screen, timezone and UA profile each session.',
    icon: 'finger-print-outline',
  },
  {
    key: 'perTabFingerprint',
    title: 'Separate identity per tab',
    detail: 'Give every tab its own fingerprint, so two tabs cannot be linked to each other.',
    icon: 'albums-outline',
  },
  {
    key: 'liveProbe',
    title: 'Live fingerprint probe',
    detail:
      'Measure the fingerprint from inside each page and show what the site actually sees — so you can verify the camouflage, not just trust it.',
    icon: 'scan-outline',
  },
  {
    key: 'geoCoherentPersona',
    title: 'Region-coherent persona',
    detail:
      'Match timezone and language to the country of the site you visit, so no contradictory signal betrays you.',
    icon: 'compass-outline',
  },
  {
    key: 'stripTrackingParams',
    title: 'Strip tracking parameters',
    detail:
      'Remove utm_*, fbclid, gclid, igshid and similar identifiers from every URL before it is requested.',
    icon: 'cut-outline',
  },
  {
    key: 'blockCnameCloaking',
    title: 'Block CNAME-cloaked analytics',
    detail:
      'Catch third-party analytics served from a first-party-looking subdomain, which a domain blocklist never sees.',
    icon: 'eye-outline',
  },
  {
    key: 'globalPrivacyControl',
    title: 'Global Privacy Control',
    detail: 'Send Sec-GPC: 1 — a legally binding opt-out from the sale or sharing of your data.',
    icon: 'hand-left-outline',
  },
  {
    key: 'blockWebRtcLeak',
    title: 'WebRTC IP-leak protection',
    detail: 'Strip local-IP candidates from WebRTC, which otherwise reveal your real address.',
    icon: 'git-network-outline',
  },
  {
    key: 'coarsenTimers',
    title: 'Coarsen high-res timers',
    detail: 'Round performance.now() so timing side channels cannot fingerprint your device.',
    icon: 'time-outline',
  },
  {
    key: 'clearOnExit',
    title: 'Clear data on exit',
    detail: 'Wipe cookies, storage and cache when the app is closed.',
    icon: 'trash-outline',
  },
];

export default function SettingsScreen() {
  const colors = useColors();
  const [settings, setSettings, status] = usePrivacySettings();
  const [confirmClear, setConfirmClear] = useState(false);

  const set = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: colors.primary }]}>
          <Ionicons name="shield-half" size={26} color={colors.onPrimary} />
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.brand, { color: colors.text }]}>{BRAND.name}</Text>
          <Text style={[styles.version, { color: colors.muted }]}>
            Privacy browser · v{BRAND.version}
          </Text>
        </View>
      </View>

      <Text style={[styles.section, { color: colors.muted }]}>PROTECTION</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {TOGGLES.map((t, i) => (
          <View
            key={t.key}
            style={[
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            ]}>
            <Ionicons name={t.icon} size={20} color={colors.primary} style={styles.rowIcon} />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{t.title}</Text>
              <Text style={[styles.rowDetail, { color: colors.muted }]}>{t.detail}</Text>
            </View>
            <Switch
              value={settings[t.key]}
              onValueChange={(v) => set(t.key, v)}
              disabled={status === 'loading'}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor={colors.card}
            />
          </View>
        ))}
      </View>

      <Text style={[styles.section, { color: colors.muted }]}>SESSION BURN TIMER</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.rowDetail, { color: colors.muted, padding: spacing.md }]}>
          Destroy every tab's data and rotate the fingerprint automatically after this long.
          A hard ceiling on session lifetime, so a session left open all day cannot build a
          profile.
        </Text>
        {BURN_OPTIONS.map((opt) => {
          const selected = settings.burnInterval === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => set('burnInterval', opt.value as BurnInterval)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.row,
                { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{opt.label}</Text>
              </View>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? colors.primary : colors.muted}
              />
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.section, { color: colors.muted }]}>SEARCH ENGINE</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(Object.keys(SEARCH_ENGINES) as SearchEngine[]).map((key, i) => {
          const selected = settings.searchEngine === key;
          return (
            <Pressable
              key={key}
              onPress={() => set('searchEngine', key)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{SEARCH_ENGINES[key].label}</Text>
              </View>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? colors.primary : colors.muted}
              />
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.section, { color: colors.muted }]}>DATA</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable style={styles.row} onPress={() => setConfirmClear(true)} accessibilityRole="button">
          <Ionicons name="trash-outline" size={20} color={colors.danger} style={styles.rowIcon} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.danger }]}>Clear all browsing data</Text>
            <Text style={[styles.rowDetail, { color: colors.muted }]}>
              Cookies, storage, cache and the current fingerprint.
            </Text>
          </View>
        </Pressable>
      </View>

      <Text style={[styles.section, { color: colors.muted }]}>ABOUT</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.about, { color: colors.muted }]}>
          {BRAND.name} blocks {TRACKER_COUNT} tracker domains and randomizes your fingerprint each
          session. Ads are deliberately left visible — only the tracking around them is stopped.
        </Text>
        <Text style={[styles.about, { color: colors.muted }]}>
          Limits, stated plainly: this is not Tor, your IP address is still visible to the sites you
          visit, and fingerprint randomization raises the cost of tracking without making it
          impossible. Cookies are isolated per tab lifetime rather than in a separate jar per tab.
        </Text>
      </View>

      <ConfirmDialog
        visible={confirmClear}
        title="Clear all browsing data?"
        message="This wipes cookies, local storage, IndexedDB, cache and rotates your fingerprint. Open tabs will need to reload."
        confirmTitle="Clear"
        cancelTitle="Cancel"
        destructive
        onConfirm={() => setConfirmClear(false)}
        onCancel={() => setConfirmClear(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  mark: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroText: { gap: 2 },
  brand: { fontSize: 22, fontWeight: '800' },
  version: { fontSize: 13 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowIcon: { marginTop: 2 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowDetail: { fontSize: 12, lineHeight: 17 },
  about: { fontSize: 13, lineHeight: 19, padding: spacing.md },
});
