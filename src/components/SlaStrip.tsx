import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, fonts, layout, radius, spacing, type } from '../theme';

export type SlaLevel = 'ok' | 'warn' | 'crit' | 'late';

export interface SlaStripProps {
  /** Hours left against the agreed turnaround. Negative means overdue. */
  hoursLeft: number;
  /** Overrides the derived caption, e.g. "Collected 2 days ago". */
  caption?: string;
  style?: ViewStyle;
}

const LEVELS: Record<SlaLevel, { fg: string; bg: string; border: string; icon: 'clock' | 'alert-triangle' }> = {
  ok: { fg: colors.success, bg: colors.successBg, border: colors.success, icon: 'clock' },
  warn: { fg: colors.warning, bg: colors.warningBg, border: colors.warning, icon: 'clock' },
  crit: { fg: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder, icon: 'alert-triangle' },
  late: { fg: colors.danger, bg: colors.dangerBg, border: colors.danger, icon: 'alert-triangle' },
};

const CAPTIONS: Record<SlaLevel, string> = {
  ok: 'Within the agreed turnaround',
  warn: 'Due back soon',
  crit: 'Due back within hours',
  late: 'Past the agreed turnaround',
};

/**
 * How long is left on a finishing partner's agreed turnaround.
 *
 * Thresholds are fixed rather than a fraction of `sla_hours`: "six hours left"
 * is the same amount of daylight to chase a partner in whether the agreement
 * was twelve hours or three days, so a proportional band would go red on a
 * short SLA that is comfortably on track.
 */
export function slaLevel(hoursLeft: number): SlaLevel {
  if (hoursLeft <= 0) return 'late';
  if (hoursLeft <= 6) return 'crit';
  if (hoursLeft <= 12) return 'warn';
  return 'ok';
}

/**
 * Hours remaining from a drop-off time and the turnaround snapshotted onto the
 * movement. Reads `sla_hours` off the movement, never off the partner — a
 * partner's setting can change after the sheets have already gone out.
 */
export function hoursLeftFrom(sentAt: string | null, slaHours: number): number {
  if (!sentAt) return slaHours;
  const deadline = new Date(sentAt).getTime() + slaHours * 60 * 60 * 1000;
  return (deadline - Date.now()) / (60 * 60 * 1000);
}

/** "6h" while there is time left, "LATE" once there is not. */
export function slaValueLabel(hoursLeft: number): string {
  if (hoursLeft <= 0) return 'LATE';
  if (hoursLeft < 1) return `${Math.max(1, Math.round(hoursLeft * 60))}m`;
  return `${Math.round(hoursLeft)}h`;
}

export function SlaStrip({ hoursLeft, caption, style }: SlaStripProps) {
  const level = slaLevel(hoursLeft);
  const palette = LEVELS[level];

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${slaValueLabel(hoursLeft)}. ${caption ?? CAPTIONS[level]}`}
      style={[styles.strip, { backgroundColor: palette.bg, borderColor: palette.border }, style]}
    >
      <Feather name={palette.icon} size={16} color={palette.fg} />
      <Text style={[styles.value, { color: palette.fg }]}>{slaValueLabel(hoursLeft)}</Text>
      <Text style={[type.label, styles.caption]} numberOfLines={1}>
        {caption ?? CAPTIONS[level]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    paddingHorizontal: spacing.tight + 2,
    paddingVertical: spacing.tight,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
  },
  value: {
    fontFamily: fonts.mono.bold,
    fontSize: 15,
    lineHeight: 20,
  },
  caption: {
    flex: 1,
  },
});
