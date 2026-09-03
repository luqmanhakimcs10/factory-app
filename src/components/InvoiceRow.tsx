import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, spacing, type } from '../theme';

export interface InvoiceRowProps {
  label: string;
  value: string;
  /** Renders larger, in navy, above a top rule. */
  total?: boolean;
  /** Renders a pencil and makes the row tappable — wire to the numeric keypad. */
  editable?: boolean;
  onPress?: () => void;
}

export function InvoiceRow({
  label,
  value,
  total = false,
  editable = false,
  onPress,
}: InvoiceRowProps) {
  const content = (
    <View style={[styles.row, total && styles.totalRow]}>
      <Text style={total ? type.bodyStrong : type.body}>{label}</Text>
      <View style={styles.valueGroup}>
        <Text style={[type.code, styles.value, total && styles.totalValue]}>{value}</Text>
        {editable ? <Feather name="edit-2" size={14} color={colors.textMuted} /> : null}
      </View>
    </View>
  );

  if (!editable || !onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label}`}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.tight,
    gap: spacing.tight,
  },
  totalRow: {
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
    paddingTop: spacing.tight + 4,
    marginTop: spacing.hair,
  },
  valueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.hair + 2,
  },
  value: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: 20,
    color: colors.primary,
  },
});
