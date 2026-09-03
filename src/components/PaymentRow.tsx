import { StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';

export interface PaymentRowProps {
  amount: string;
  dateLabel: string;
  /** Who recorded it, when that is known. */
  recordedBy?: string | null;
  /** Every payment carries a proof photo; this marks that it is attached. */
  hasProof?: boolean;
}

/** One line of a payment history. Read-only — a payment is permanent. */
export function PaymentRow({
  amount,
  dateLabel,
  recordedBy,
  hasProof = true,
}: PaymentRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Feather name="check" size={14} color={colors.success} />
      </View>

      <View style={styles.text}>
        <Text style={type.bodyStrong}>{amount}</Text>
        <Text style={type.label}>
          {dateLabel}
          {recordedBy ? ` · ${recordedBy}` : ''}
        </Text>
      </View>

      {hasProof ? (
        <Feather name="paperclip" size={14} color={colors.textMuted} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingVertical: spacing.tight,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: radius.icon - 4,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
