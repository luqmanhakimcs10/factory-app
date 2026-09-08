import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts, radius, spacing } from '../theme';

export interface GrantChipsProps {
  /** Already-resolved display labels, in the order they should read. */
  labels: readonly string[];
  style?: ViewStyle;
}

/**
 * The small uppercase pills under a staff member's name.
 *
 * Informational only, and deliberately not tappable: the cards below the header
 * are the navigation, and a chip that looks like a shortcut but is not one is
 * worse than no chip. They exist so a person can see at a glance what their
 * account is allowed to do, including on a day when they have nothing pending
 * and the grid is all zeroes.
 */
export function GrantChips({ labels, style }: GrantChipsProps) {
  if (labels.length === 0) return null;

  return (
    <View style={[styles.row, style]}>
      {labels.map((label) => (
        <View key={label} style={styles.chip}>
          <Text style={styles.label} numberOfLines={1}>
            {label.toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight - 2,
  },
  chip: {
    paddingHorizontal: spacing.tight + 2,
    paddingVertical: spacing.hair,
    borderRadius: radius.pill,
    backgroundColor: colors.controlBg,
  },
  label: {
    fontFamily: fonts.sans.semibold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
});
