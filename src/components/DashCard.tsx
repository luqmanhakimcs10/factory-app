import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, fonts, layout, spacing } from '../theme';

export type DashCardTone = 'default' | 'success' | 'warning' | 'danger';

export interface DashCardProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  /**
   * Big mono figure. A string so callers can render "3/8" as well as counts.
   *
   * Omit it entirely for a card that is a destination rather than a roster —
   * Reports Hub has nothing to count, and a placeholder dash there reads as a
   * number that failed to load.
   */
  count?: string | number;
  title: string;
  subLabel?: string;
  /**
   * Icon-square palette. Purely visual rhythm across a grid — it carries no
   * status meaning, so a card is not "warning" for being amber.
   */
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

/**
 * Large tappable summary card — a dashboard is a grid of these.
 *
 * The whole card is the tap target, not the icon or the title inside it.
 * Metrics here come from the dashboard mockup's CSS and are deliberately not
 * the shared `radius`/`type` tokens: dashboard cards are a touch softer (16pt)
 * and a touch larger than the cards used elsewhere in the app.
 */
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
      accessibilityLabel={count === undefined ? title : `${title}, ${count}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      <View style={[styles.iconSquare, { backgroundColor: palette.bg }]}>
        <Feather name={icon} size={20} color={palette.fg} />
      </View>
      {count === undefined ? null : <Text style={styles.count}>{count}</Text>}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {subLabel ? (
        <Text style={styles.subLabel} numberOfLines={3}>
          {subLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    // Two per row, and only two: the seventh card in a seven-card grid sits at
    // half width on its own row rather than stretching across it.
    flexBasis: '48%',
    flexGrow: 0,
    maxWidth: '48%',
    paddingVertical: 18,
    paddingHorizontal: 15,
    gap: spacing.tight + 4,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  iconSquare: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontFamily: fonts.mono.bold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.textPrimary,
  },
  title: {
    fontFamily: fonts.sans.semibold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  subLabel: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
});
