import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, spacing, useColors } from '@/constants/theme';

type Props = {
  /** The URL currently loaded, shown when the field is not being edited. */
  url: string;
  /** True when the loaded page is plain http and HTTPS-only is on. */
  insecure: boolean;
  httpsOnly: boolean;
  onSubmit: (text: string) => void;
  onFocusChange?: (focused: boolean) => void;
};

/**
 * The address bar. It shows the host while idle and the full URL while editing, so the
 * bar stays readable on a phone. A lock icon reflects the real scheme of the page.
 */
export function AddressBar({ url, insecure, httpsOnly, onSubmit, onFocusChange }: Props) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (!editing) setDraft(url);
  }, [url, editing]);

  const focus = () => {
    setEditing(true);
    setDraft(url);
    onFocusChange?.(true);
    setTimeout(() => input.current?.focus(), 0);
  };

  const blur = () => {
    setEditing(false);
    onFocusChange?.(false);
  };

  const submit = () => {
    const text = draft.trim();
    blur();
    if (text) onSubmit(text);
  };

  const secure = url.startsWith('https://');
  const icon = insecure ? 'warning-outline' : secure ? 'lock-closed' : 'search';
  const iconColor = insecure ? colors.warn : secure ? colors.success : colors.muted;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={icon} size={15} color={iconColor} style={styles.icon} />
      {editing ? (
        <TextInput
          ref={input}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          onBlur={blur}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          placeholder="Search or enter address"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Address bar"
          style={[styles.input, { color: colors.text }]}
        />
      ) : (
        <Pressable style={styles.display} onPress={focus} accessibilityRole="button" accessibilityLabel="Edit address">
          <Text numberOfLines={1} style={[styles.url, { color: url ? colors.text : colors.muted }]}>
            {url || 'Search or enter address'}
          </Text>
        </Pressable>
      )}
      {editing ? (
        <Pressable onPress={submit} hitSlop={8} accessibilityLabel="Go">
          <Ionicons name="arrow-forward-circle" size={22} color={colors.primary} />
        </Pressable>
      ) : (
        <Pressable onPress={() => onSubmit(url)} hitSlop={8} accessibilityLabel="Reload">
          <Ionicons name="refresh" size={18} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  icon: { marginTop: 1 },
  display: { flex: 1, justifyContent: 'center', minHeight: 44 },
  url: { fontSize: 15 },
  input: { flex: 1, fontSize: 15, paddingVertical: 0, minHeight: 44 },
});
