import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BRAND, radius, spacing, useColors } from '@/constants/theme';
import { TRACKER_COUNT } from '@/lib/blocklist';

type Props = {
  onOpen: (url: string) => void;
  onOpenShield: () => void;
};

const SHORTCUTS: { label: string; url: string; icon: 'newspaper-outline' | 'code-slash-outline' | 'book-outline' | 'logo-github' }[] = [
  { label: 'Wikipedia', url: 'https://www.wikipedia.org', icon: 'book-outline' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com', icon: 'newspaper-outline' },
  { label: 'MDN', url: 'https://developer.mozilla.org', icon: 'code-slash-outline' },
  { label: 'GitHub', url: 'https://github.com', icon: 'logo-github' },
];

/** The start page: brand, a one-line promise, and a few shortcuts. */
export function HomeScreen({ onOpen, onOpenShield }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: colors.primary }]}>
          <Ionicons name="shield-half" size={34} color={colors.onPrimary} />
        </View>
        <Text style={[styles.brand, { color: colors.text }]}>{BRAND.name}</Text>
        <Text style={[styles.tagline, { color: colors.muted }]}>{BRAND.tagline}</Text>
      </View>

      <Pressable
        onPress={onOpenShield}
        accessibilityRole="button"
        style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="shield-checkmark" size={20} color={colors.success} />
        <View style={styles.statText}>
          <Text style={[styles.statTitle, { color: colors.text }]}>{TRACKER_COUNT} tracker domains blocked</Text>
          <Text style={[styles.statSub, { color: colors.muted }]}>Tap to see this session's fingerprint</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <View style={styles.grid}>
        {SHORTCUTS.map((s) => (
          <Pressable
            key={s.url}
            onPress={() => onOpen(s.url)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons name={s.icon} size={22} color={colors.primary} />
            <Text style={[styles.tileLabel, { color: colors.text }]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.footnote, { color: colors.muted }]}>
        Each tab is isolated. Your fingerprint is randomized every session.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.lg, gap: spacing.lg, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: spacing.sm },
  mark: { width: 68, height: 68, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statText: { flex: 1, gap: 2 },
  statTitle: { fontSize: 14, fontWeight: '600' },
  statSub: { fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileLabel: { fontSize: 13, fontWeight: '600' },
  footnote: { fontSize: 12, textAlign: 'center' },
});
