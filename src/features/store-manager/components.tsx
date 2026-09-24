import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';

import { Card, EmptyState, TopBar } from '../../components';
import { colors, fonts, layout, radius, spacing, type } from '../../theme';

/**
 * Pieces shared by the Store Manager screens, drawn from the reference mockup's
 * own vocabulary: code badges, chip rows, lot rows, note cards in four tones.
 */

// --- Screen shell -------------------------------------------------------------

export function DetailShell({
  title,
  trailing,
  onBack,
  loading,
  error,
  footer,
  children,
}: {
  title: string;
  trailing?: string;
  onBack: () => void;
  loading?: boolean;
  error?: Error | null;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={title} trailing={trailing} onPressBack={onBack} />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Could not load" hint={error.message} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      )}
      {footer && !loading && !error ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.content) }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <Card tone="danger">
      <Text style={[type.bodyStrong, { color: colors.danger }]}>{title}</Text>
      <Text style={type.body}>{message}</Text>
    </Card>
  );
}

// --- Labels, chips ------------------------------------------------------------

export function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children.toUpperCase()}</Text>;
}

export function Chips<T extends string>({
  options,
  selected,
  onSelect,
  alarm,
}: {
  options: { value: T; label: string }[];
  selected: T | null;
  onSelect: (value: T) => void;
  /** Values drawn in the danger outline while unselected (e.g. Empty > 0). */
  alarm?: T[];
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const on = option.value === selected;
        const warn = !on && alarm?.includes(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(option.value)}
            style={[styles.chip, on && styles.chipOn, warn && styles.chipAlarm]}
          >
            <Text
              style={[
                type.pill,
                styles.chipLabel,
                on && styles.chipLabelOn,
                warn && { color: colors.danger },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- Code badge, pills --------------------------------------------------------

export function CodeBadge({ code, small }: { code: string; small?: boolean }) {
  return (
    <View style={[styles.badge, small && styles.badgeSmall]}>
      <Text style={[styles.badgeText, small && styles.badgeTextSmall]}>{code}</Text>
    </View>
  );
}

export type PillTone = 'good' | 'warn' | 'danger' | 'muted';

const PILL: Record<PillTone, { fg: string; bg: string }> = {
  good: { fg: colors.success, bg: colors.successBg },
  warn: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  muted: { fg: colors.textSecondary, bg: colors.draftBg },
};

export function Pill({ label, tone }: { label: string; tone: PillTone }) {
  return (
    <View style={[styles.pill, { backgroundColor: PILL[tone].bg }]}>
      <Text style={[type.pill, { color: PILL[tone].fg }]}>{label}</Text>
    </View>
  );
}

export function Tag({ label, tone }: { label: string; tone: 'navy' | 'amber' }) {
  const amber = tone === 'amber';
  return (
    <View style={[styles.tag, { backgroundColor: amber ? colors.warningBg : colors.neutralAccent }]}>
      <Text style={[styles.tagText, { color: amber ? colors.warning : colors.primary }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

// --- Notes, totals, buttons ---------------------------------------------------

export type NoteTone = 'amber' | 'plain' | 'good' | 'warn';

const NOTE: Record<NoteTone, { fg: string; bg: string; border: string }> = {
  amber: { fg: colors.warning, bg: colors.warningBg, border: colors.warningBg },
  plain: { fg: colors.textSecondary, bg: colors.surface, border: colors.border },
  good: { fg: colors.success, bg: colors.successBg, border: colors.successBg },
  warn: { fg: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder },
};

export function Note({ text, tone = 'amber' }: { text: string; tone?: NoteTone }) {
  const t = NOTE[tone];
  return (
    <View style={[styles.note, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text
        style={[
          tone === 'plain' ? type.label : type.bodyStrong,
          styles.noteText,
          { color: t.fg },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.total}>
      <Text style={type.caption}>{label.toUpperCase()}</Text>
      <Text style={[type.numeric, styles.totalValue]}>{value}</Text>
    </View>
  );
}

/** The dashed "+ Create ..." button at the top of each list. */
export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.addButton}>
      <Feather name="plus" size={17} color={colors.primary} />
      <Text style={[type.bodyStrong, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

/** A tappable value that opens the numeric keypad. */
export function TapField({
  icon,
  value,
  hint,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  value: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.tapField}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={17} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, { fontFamily: fonts.mono.semibold }]}>{value}</Text>
        <Text style={type.caption}>{hint}</Text>
      </View>
    </Pressable>
  );
}

// --- Rows ---------------------------------------------------------------------

/** Code badge on the left, two lines in the middle, a figure + status right. */
export function MaterialLine({
  code,
  title,
  sub,
  extra,
  value,
  status,
  statusTone = 'good',
  onPressValue,
}: {
  code: string;
  title: string;
  sub?: string;
  extra?: ReactNode;
  value?: string;
  status?: string;
  statusTone?: 'good' | 'warn';
  onPressValue?: () => void;
}) {
  return (
    <View style={styles.materialRow}>
      <CodeBadge code={code} small />
      <View style={styles.flex}>
        <Text style={type.bodyStrong}>{title}</Text>
        {sub ? <Text style={type.caption}>{sub}</Text> : null}
        {extra}
      </View>
      <View style={styles.right}>
        {value !== undefined ? (
          onPressValue ? (
            <Pressable accessibilityRole="button" onPress={onPressValue} style={styles.tapValue}>
              <Text style={styles.qty}>{value}</Text>
              <Feather name="chevron-right" size={15} color={colors.primary} />
            </Pressable>
          ) : (
            <Text style={styles.qty}>{value}</Text>
          )
        ) : null}
        {status ? (
          <Text
            style={[
              styles.status,
              { color: statusTone === 'good' ? colors.success : colors.danger },
            ]}
          >
            {status.toUpperCase()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** A list row inside a card: text column and an optional right pill. */
export function ListRow({
  children,
  right,
  onPress,
}: {
  children: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={styles.listRow}>
      <View style={styles.flex}>{children}</View>
      {right}
    </Pressable>
  );
}

export function Mono({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <Text style={strong ? styles.monoStrong : styles.mono}>{children}</Text>;
}

export function CodeChipText({ children }: { children: string }) {
  return (
    <View style={styles.codeChip}>
      <Text style={styles.codeChipText}>{children}</Text>
    </View>
  );
}

export const smStyles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.tight },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: spacing.content * 3 },
  content: { padding: spacing.content, gap: spacing.block, paddingBottom: spacing.content * 3 },
  footer: {
    flexDirection: 'row',
    gap: spacing.tight,
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
  flex: { flex: 1, gap: 2 },
  fieldLabel: {
    fontFamily: fonts.sans.semibold,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textSecondary,
    marginBottom: spacing.tight,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.tight },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.controlBg,
    borderWidth: layout.hairline,
    borderColor: colors.controlBg,
  },
  chipOn: { backgroundColor: colors.neutralAccent, borderColor: colors.primary },
  chipAlarm: { borderColor: colors.danger, backgroundColor: colors.surface },
  chipLabel: { color: colors.textSecondary, fontSize: 13 },
  chipLabelOn: { color: colors.primary },
  badge: {
    minWidth: 54,
    height: 42,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSmall: { minWidth: 44, height: 32, borderRadius: 7 },
  badgeText: { fontFamily: fonts.mono.bold, fontSize: 17, color: colors.surface },
  badgeTextSmall: { fontSize: 14 },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontFamily: fonts.sans.semibold, fontSize: 11, letterSpacing: 0.6 },
  note: {
    padding: spacing.content - 2,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
  },
  noteText: { fontSize: 14, lineHeight: 20 },
  total: {
    padding: spacing.content,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    gap: 4,
  },
  totalValue: { fontSize: 24, lineHeight: 30 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight,
    height: 52,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  tapField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 4,
    padding: spacing.tight + 4,
    marginTop: spacing.tight,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neutralAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 4,
    paddingVertical: spacing.tight + 2,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  right: { alignItems: 'flex-end', gap: 2 },
  qty: { fontFamily: fonts.mono.bold, fontSize: 16, color: colors.textPrimary },
  status: { fontFamily: fonts.sans.semibold, fontSize: 11, letterSpacing: 0.5 },
  tapValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.neutralAccent,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    paddingVertical: spacing.content - 4,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  mono: { fontFamily: fonts.mono.medium, fontSize: 13, color: colors.textSecondary },
  monoStrong: { fontFamily: fonts.mono.semibold, fontSize: 15, color: colors.textPrimary },
  codeChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.neutralAccent,
  },
  codeChipText: { fontFamily: fonts.mono.medium, fontSize: 13, color: colors.primary },
});
