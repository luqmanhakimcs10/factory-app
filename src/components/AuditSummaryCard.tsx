import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';

export interface AuditSummaryCardProps {
  date: string;
  itemsChecked: number;
  itemsMatched: number;
  varianceCount: number;
  /** Opens the variance breakdown. */
  onPress?: () => void;
}

export function AuditSummaryCard({
  date,
  itemsChecked,
  itemsMatched,
  varianceCount,
  onPress,
}: AuditSummaryCardProps) {
  const clean = varianceCount === 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Audit ${date}`}
      disabled={!onPress}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={[styles.icon, clean ? styles.iconClean : styles.iconVariance]}>
          <Feather
            name={clean ? 'check' : 'alert-triangle'}
            size={18}
            color={clean ? colors.success : colors.warning}
          />
        </View>
        <View style={styles.text}>
          <Text style={type.bodyStrong}>
            {itemsMatched} of {itemsChecked} {itemsChecked === 1 ? 'item' : 'items'} matched
          </Text>
          <Text style={type.label}>{date}</Text>
        </View>
        {onPress ? (
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        ) : null}
      </View>

      <Text style={[type.caption, clean ? styles.noteClean : styles.noteVariance]}>
        {clean
          ? 'No variances found.'
          : `${varianceCount} ${varianceCount === 1 ? 'variance' : 'variances'} to review.`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.content - 2,
    gap: spacing.tight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconClean: {
    backgroundColor: colors.successBg,
  },
  iconVariance: {
    backgroundColor: colors.warningBg,
  },
  text: {
    flex: 1,
  },
  noteClean: {
    color: colors.textMuted,
  },
  noteVariance: {
    color: colors.warning,
  },
});
