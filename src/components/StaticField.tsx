import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, radius, spacing, type } from '../theme';

export interface StaticFieldProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  /** Uppercase caption above the value. */
  label: string;
  value: string;
  style?: ViewStyle;
}

/** Read-only value block — generated codes, computed totals, fixed details. */
export function StaticField({ icon, label, value, style }: StaticFieldProps) {
  return (
    <View style={[styles.field, style]}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <View style={styles.text}>
        <Text style={[type.caption, styles.label]}>{label.toUpperCase()}</Text>
        <Text style={[type.code, styles.value]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    padding: spacing.tight + 2,
    borderRadius: radius.card,
    backgroundColor: colors.bg,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutralAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  label: {
    letterSpacing: 0.6,
  },
  value: {
    fontSize: 15,
    color: colors.textPrimary,
  },
});
