import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, radius, type } from '../theme';
import type { ApprovalStatus } from '../data/rejectReasons';

/**
 * `draft`/`progress`/`completed` describe an order; `passed`/`returned`
 * describe an inspection unit. One pill covers both so a queue row can mix them.
 */
export type PillStatus =
  | 'draft'
  | 'progress'
  | 'completed'
  | 'passed'
  | 'returned';

/**
 * Approval status -> pill. One mapping, so the Accountant's read-only views and
 * Company Admin's inbox cannot end up colouring the same record differently.
 */
export function approvalPill(status: ApprovalStatus): PillStatus {
  if (status === 'approved') return 'completed';
  if (status === 'rejected') return 'returned';
  return 'progress';
}

type PillTone = {
  fg: string;
  bg: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
};

const TONES: Record<PillStatus, PillTone> = {
  draft: {
    fg: colors.textSecondary,
    bg: colors.draftBg,
    icon: 'edit-3',
    label: 'Draft',
  },
  progress: {
    fg: colors.warning,
    bg: colors.warningBg,
    icon: 'clock',
    label: 'In Progress',
  },
  completed: {
    fg: colors.success,
    bg: colors.successBg,
    icon: 'check-circle',
    label: 'Completed',
  },
  passed: {
    fg: colors.success,
    bg: colors.successBg,
    icon: 'check',
    label: 'Passed',
  },
  returned: {
    fg: colors.danger,
    bg: colors.dangerBg,
    icon: 'corner-up-left',
    label: 'Returned',
  },
};

export interface StatusPillProps {
  status: PillStatus;
  /** Overrides the default label, e.g. "3 returned". */
  label?: string;
  style?: ViewStyle;
}

export function StatusPill({ status, label, style }: StatusPillProps) {
  const tone = TONES[status];

  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }, style]}>
      <Feather name={tone.icon} size={12} color={tone.fg} />
      <Text style={[type.pill, { color: tone.fg }]} numberOfLines={1}>
        {label ?? tone.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
});
