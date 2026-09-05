import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, type } from '../theme';

export interface FilterChipsProps {
  label: string;
  /**
   * Chip values. Always derived from the rows actually present, never a static
   * list — a filter for a client with no invoices is noise.
   */
  values: string[];
  /** `null` is the leading "All" chip. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Maps a raw value to what the chip shows. */
  format?: (value: string) => string;
  allLabel?: string;
}

/**
 * Generic single-select chip row, used by every filter in the Accountant and
 * Company Admin modules.
 *
 * Shared rather than per-module: Reports Hub filters by month, audit date and
 * worker name with exactly the row the Accountant's six tabs already use, and a
 * second copy is how two filter rows end up with two selected-chip treatments.
 */
export function FilterChips({
  label,
  values,
  value,
  onChange,
  format = (raw) => raw,
  allLabel = 'All',
}: FilterChipsProps) {
  if (values.length === 0) return null;

  const chips: { key: string | null; label: string }[] = [
    { key: null, label: allLabel },
    ...values.map((raw) => ({ key: raw, label: format(raw) })),
  ];

  return (
    <View style={styles.wrapper}>
      <Text style={type.caption}>{label.toUpperCase()}</Text>
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
    </View>
  );
}

/** Distinct, defined values in first-seen order — the chip list for a filter. */
export function distinct<T>(rows: T[], pick: (row: T) => string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const value = pick(row);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Local-day key, for date chips. */
export function dayOf(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.hair,
  },
  row: {
    gap: spacing.tight - 2,
    paddingVertical: spacing.hair,
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
