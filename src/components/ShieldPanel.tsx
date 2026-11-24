import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BRAND, radius, spacing, useColors } from '@/constants/theme';
import type { FingerprintProfile } from '@/lib/fingerprint';
import { compareProbe, probeScore } from '@/lib/fingerprint-probe';
import type { HeaderRule } from '@/lib/header-rules';
import { PERSONA_MODE_LABEL, cohortShare } from '@/lib/persona';
import type { PrivacySettings } from '@/lib/privacy-settings';
import { formatCountdown } from '@/lib/session-burn';
import type { Tab } from '@/lib/tab-isolation';

type Props = {
  visible: boolean;
  tab: Tab;
  profile: FingerprintProfile;
  settings: PrivacySettings;
  headerRules: HeaderRule[];
  burnRemaining: number | null;
  onClose: () => void;
  onClear: () => void;
  onProbe: () => void;
};

function Row({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.muted }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.rowValue, { color: colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

function Toggle({ on, label }: { on: boolean; label: string }) {
  const colors = useColors();
  return (
    <View style={styles.toggleRow}>
      <Ionicons
        name={on ? 'checkmark-circle' : 'close-circle-outline'}
        size={16}
        color={on ? colors.success : colors.muted}
      />
      <Text style={[styles.toggleLabel, { color: on ? colors.text : colors.muted }]}>{label}</Text>
    </View>
  );
}

/**
 * The shield panel: what was blocked in this tab, what the browser is currently
 * pretending to be, which headers it sends, and a one-tap wipe.
 */
export function ShieldPanel({
  visible,
  tab,
  profile,
  settings,
  headerRules,
  burnRemaining,
  onClose,
  onClear,
  onProbe,
}: Props) {
  const colors = useColors();
  const share = Math.round(cohortShare(profile) * 100);
  const findings = tab.probe ? compareProbe(profile, tab.probe) : [];
  const score = probeScore(findings);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="shield-checkmark" size={22} color={colors.success} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Protection</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                {tab.blocked === 0
                  ? 'No trackers seen in this tab yet'
                  : `${tab.blocked} tracker${tab.blocked === 1 ? '' : 's'} blocked in this tab`}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close panel">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={[styles.section, { color: colors.muted }]}>ACTIVE PROTECTIONS</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Toggle on label="Tracker & telemetry blocking" />
              <Toggle on label="Ads still shown (not blocked)" />
              <Toggle on={settings.httpsOnly} label="HTTPS-only mode" />
              <Toggle on={settings.dnsOverHttps} label="DNS over HTTPS" />
              <Toggle on={settings.blockThirdPartyCookies} label="Block third-party cookies" />
              <Toggle on={settings.blockReferrer} label="Strip referrer header" />
              <Toggle on={settings.globalPrivacyControl} label="Global Privacy Control (Sec-GPC)" />
              <Toggle on={settings.blockWebRtcLeak} label="WebRTC IP-leak protection" />
              <Toggle on={settings.coarsenTimers} label="Coarsened high-res timers" />
              <Toggle on={settings.randomizeFingerprint} label="Randomized fingerprint" />
              <Toggle on={settings.perTabFingerprint} label="Separate identity per tab" />
              <Toggle on={settings.stripTrackingParams} label="Tracking parameters stripped" />
              <Toggle on={settings.blockCnameCloaking} label="CNAME-cloaked analytics blocked" />
              <Toggle on={settings.geoCoherentPersona} label="Region-coherent persona" />
              <Toggle on={settings.clearOnExit} label="Clear data on exit" />
            </View>

            <Text style={[styles.section, { color: colors.muted }]}>THIS TAB</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row label="Trackers" value={`${tab.blocked} blocked`} />
              <Row label="URL params" value={`${tab.strippedParams} stripped`} />
              <Row label="Cloaked analytics" value={`${tab.cloaked} blocked`} />
              {tab.strippedNames.length > 0 ? (
                <Row label="Params removed" value={tab.strippedNames.slice(0, 8).join(', ')} />
              ) : null}
            </View>

            <Text style={[styles.section, { color: colors.muted }]}>LIVE FINGERPRINT CHECK</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {tab.probing ? (
                <View style={styles.probeRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.rowLabel, { color: colors.muted, width: undefined }]}>
                    Measuring what this page can see…
                  </Text>
                </View>
              ) : tab.probe ? (
                <>
                  <Row label="Site sees" value={tab.probe.id} />
                  <Row label="Patches holding" value={`${score.passed} of ${score.total}`} />
                  {findings
                    .filter((f) => !f.ok)
                    .map((f) => (
                      <Row key={f.key} label={`${f.key} (leak)`} value={f.actual} />
                    ))}
                </>
              ) : (
                <Text style={[styles.rowLabel, { color: colors.muted, width: undefined }]}>
                  No measurement yet for this page.
                </Text>
              )}
              <Pressable
                onPress={onProbe}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.probeButton,
                  { borderColor: colors.border },
                  pressed && { opacity: 0.7 },
                ]}>
                <Ionicons name="scan-outline" size={16} color={colors.primary} />
                <Text style={[styles.probeText, { color: colors.primary }]}>
                  {tab.probing ? 'Measuring…' : 'Measure this page again'}
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.section, { color: colors.muted }]}>SESSION</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row
                label="Burn timer"
                value={burnRemaining === null ? 'Off' : `Wipes in ${formatCountdown(burnRemaining)}`}
              />
              <Row
                label="Tab identity"
                value={settings.perTabFingerprint ? 'Unique to this tab' : 'Shared this session'}
              />
              <Row label="Strategy" value={PERSONA_MODE_LABEL[settings.personaMode].title} />
              <Row label="Crowd" value={`${share}% of desktop devices look like this`} />
            </View>

            <Text style={[styles.section, { color: colors.muted }]}>CURRENT FINGERPRINT</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row label="Platform" value={profile.platform} />
              <Row label="Timezone" value={profile.timezone} />
              <Row label="Language" value={profile.languages.join(', ')} />
              <Row
                label="Screen"
                value={`${profile.screenWidth} × ${profile.screenHeight} @${profile.devicePixelRatio}x`}
              />
              <Row label="CPU cores" value={String(profile.hardwareConcurrency)} />
              <Row label="Device memory" value={`${profile.deviceMemory} GB`} />
              <Row
                label="GPU"
                value={profile.webglRenderer.replace(/^ANGLE \(/, '').replace(/\)$/, '')}
              />
              <Row label="Fonts" value={`${profile.fonts.length} reported`} />
              <Row label="Canvas noise" value={profile.canvasNoise.toFixed(5)} />
              <Row label="Audio noise" value={profile.audioNoise.toFixed(5)} />
              <Row label="Voices" value={`${profile.voices.length} reported`} />
              <Row label="Session seed" value={profile.seed} />
            </View>

            <Text style={[styles.section, { color: colors.muted }]}>REQUEST HEADERS</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {headerRules.length === 0 ? (
                <Text style={[styles.host, { color: colors.muted }]}>No header rules active.</Text>
              ) : (
                headerRules.map((rule) => (
                  <View key={rule.name} style={styles.ruleRow}>
                    <Text style={[styles.ruleName, { color: colors.text }]}>{rule.name}</Text>
                    <Text style={[styles.ruleValue, { color: colors.muted }]}>
                      {rule.value === null ? 'stripped' : rule.value}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {tab.blockedHosts.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.muted }]}>BLOCKED HOSTS</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {tab.blockedHosts.slice(0, 12).map((host) => (
                    <Text key={host} style={[styles.host, { color: colors.muted }]}>
                      {host}
                    </Text>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[styles.footnote, { color: colors.muted }]}>
              {BRAND.name} raises the cost of tracking; it does not make it impossible. Your IP
              address is still visible to the sites you visit.
            </Text>
          </ScrollView>

          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.clear,
              { backgroundColor: colors.danger },
              pressed && { opacity: 0.8 },
            ]}>
            <Ionicons name="trash-outline" size={18} color={colors.onPrimary} />
            <Text style={[styles.clearText, { color: colors.onPrimary }]}>
              Clear all browsing data now
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9A9AB0',
    opacity: 0.4,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 19, fontWeight: '700' },
  subtitle: { fontSize: 13 },
  body: { marginTop: spacing.md },
  bodyContent: { gap: spacing.sm, paddingBottom: spacing.md },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: spacing.sm },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toggleLabel: { fontSize: 14, flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  rowLabel: { fontSize: 13, width: 96 },
  rowValue: { fontSize: 13, flex: 1, fontWeight: '500' },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  ruleName: { fontSize: 13, fontWeight: '600' },
  ruleValue: { fontSize: 13 },
  host: { fontSize: 12 },
  footnote: { fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  clearText: { fontSize: 15, fontWeight: '700' },
  probeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  probeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
  },
  probeText: { fontSize: 14, fontWeight: '600' },
});
