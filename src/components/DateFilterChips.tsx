import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, layout, radius, spacing, type } from '../theme';

/** `null` is the leading "all"/"latest" chip. */
export type DateFilterValue = string | null;

export interface DateFilterChipsProps {
  /** ISO date strings (yyyy-mm-dd), already deduped and sorted by the caller. */
  dates: string[];
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
  /** Label for the leading chip — "All" on most tabs, "Latest" on Audit. */
  allLabel?: string;
}

/** Horizontal chip row for filtering a list down to one day. */
export function DateFilterChips({
  dates,
  value,
  onChange,
  allLabel = 'All',
}: DateFilterChipsProps) {
  const chips: { key: DateFilterValue; label: string }[] = [
    { key: null, label: allLabel },
    ...dates.map((date) => ({ key: date, label: formatChipDate(date) })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {chips.map((chip) => {
        const active = chip.key === value;
        return (
          <Pressable
            key={chip.key ?? '__all__'}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(chip.key)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[type.pill, active ? styles.labelActive : styles.label]}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Local-day key for an ISO timestamp — what the chips group on. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatChipDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.tight - 2,
    paddingHorizontal: spacing.content,
    paddingVertical: spacing.tight,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  label: {
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.surface,
  },
});
