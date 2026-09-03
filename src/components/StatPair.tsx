import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, layout, spacing, type } from '../theme';

export interface StatPairProps {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  /** Tints the right-hand figure — expenses read red. */
  rightTone?: 'default' | 'danger';
  style?: ViewStyle;
}

/** Two figures side by side, divided — income against expenses. */
export function StatPair({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  rightTone = 'default',
  style,
}: StatPairProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.half}>
        <Text style={type.caption}>{leftLabel.toUpperCase()}</Text>
        <Text style={[type.numeric, styles.value]}>{leftValue}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.half}>
        <Text style={type.caption}>{rightLabel.toUpperCase()}</Text>
        <Text
          style={[
            type.numeric,
            styles.value,
            rightTone === 'danger' && styles.danger,
          ]}
        >
          {rightValue}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  half: {
    flex: 1,
    gap: 2,
  },
  divider: {
    width: layout.hairline,
    backgroundColor: colors.border,
    marginHorizontal: spacing.content - 2,
  },
  value: {
    fontSize: 20,
    lineHeight: 26,
  },
  danger: {
    color: colors.danger,
  },
});
