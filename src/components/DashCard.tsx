import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';

export type DashCardTone = 'default' | 'success' | 'warning' | 'danger';

export interface DashCardProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  /** Big mono figure. A string so callers can render "3/8" as well as counts. */
  count: string | number;
  title: string;
  subLabel?: string;
  tone?: DashCardTone;
  onPress?: () => void;
  style?: ViewStyle;
}

const TONES: Record<DashCardTone, { fg: string; bg: string }> = {
  default: { fg: colors.primary, bg: colors.neutralAccent },
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
};

/** Large tappable summary card — the dashboard is a grid of these. */
export function DashCard({
  icon,
  count,
  title,
  subLabel,
  tone = 'default',
  onPress,
  style,
}: DashCardProps) {
  const palette = TONES[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${count}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      <View style={[styles.iconCircle, { backgroundColor: palette.bg }]}>
        <Feather name={icon} size={20} color={palette.fg} />
      </View>
      <Text style={[type.numeric, styles.count]}>{count}</Text>
      <Text style={type.bodyStrong} numberOfLines={1}>
        {title}
      </Text>
      {subLabel ? (
        <Text style={type.caption} numberOfLines={2}>
          {subLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '46%',
    padding: spacing.content - 2,
    gap: spacing.hair,
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.hair,
  },
  count: {
    fontSize: 26,
    lineHeight: 32,
  },
});
