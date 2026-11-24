import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useColors } from '@/constants/theme';
import type { Tab } from '@/lib/tab-isolation';
import { shortHost } from '@/lib/url';

type Props = {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
};

/** Horizontal tab strip: tap to switch, × to close, + to open a new isolated tab. */
export function TabBar({ tabs, activeId, onSelect, onClose, onNew }: Props) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onSelect(tab.id)}
              accessibilityRole="button"
              accessibilityLabel={`Tab ${shortHost(tab.url)}`}
              style={[
                styles.tab,
                {
                  backgroundColor: active ? colors.primarySoft : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}>
              <Text
                numberOfLines={1}
                style={[styles.label, { color: active ? colors.primary : colors.muted }]}>
                {shortHost(tab.url)}
              </Text>
              <Pressable onPress={() => onClose(tab.id)} hitSlop={10} accessibilityLabel="Close tab">
                <Ionicons name="close" size={14} color={active ? colors.primary : colors.muted} />
              </Pressable>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={onNew}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="New tab"
        style={[styles.newTab, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Ionicons name="add" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scroll: { gap: spacing.sm, paddingEnd: spacing.xs },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 150,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 13, fontWeight: '600', maxWidth: 100 },
  newTab: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
