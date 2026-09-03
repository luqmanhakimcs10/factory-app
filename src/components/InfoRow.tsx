import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';

export interface InfoRowProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  subLabel?: string;
  /** Tint for the icon square; defaults to the brand navy. */
  tone?: 'default' | 'success' | 'warning' | 'danger';
  /** Renders a chevron and makes the row pressable. */
  onPress?: () => void;
  /** Right-hand value, mono — counts, codes. */
  trailing?: string;
  divider?: boolean;
  style?: ViewStyle;
}

const TONES = {
  default: { fg: colors.primary, bg: colors.neutralAccent },
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
} as const;

export function InfoRow({
  icon,
  label,
  subLabel,
  tone = 'default',
  onPress,
  trailing,
  divider = false,
  style,
}: InfoRowProps) {
  const palette = TONES[tone];

  const content = (
    <View style={[styles.row, divider && styles.divider, style]}>
      <View style={[styles.iconSquare, { backgroundColor: palette.bg }]}>
        <Feather name={icon} size={18} color={palette.fg} />
      </View>

      <View style={styles.text}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {label}
        </Text>
        {subLabel ? (
          <Text style={type.label} numberOfLines={2}>
            {subLabel}
          </Text>
        ) : null}
      </View>

      {trailing ? <Text style={type.code}>{trailing}</Text> : null}
      {onPress ? (
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingVertical: spacing.tight + 2,
  },
  divider: {
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  iconSquare: {
    width: 36,
    height: 36,
    borderRadius: radius.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
