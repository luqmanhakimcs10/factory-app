import { StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, type } from '../theme';
import { getSwatch } from '../data/swatches';
import { Button } from './Button';
import { ColorSwatch } from './ColorSwatch';

export type SheetPhaseTone = 'neutral' | 'progress' | 'done';

export interface SheetRowProps {
  colorId: string;
  customHex?: string | null;
  repeats: number;
  /** Display-only repeat codes, generated from the repeat count. */
  repeatCodes: string[];
  /** Phase pill text, e.g. "In Production" or "Ready for Clipping". */
  phaseLabel: string;
  phaseTone?: SheetPhaseTone;
  /** Context action for the sheet's current phase. Omit when there is nothing to do. */
  actionLabel?: string;
  onPressAction?: () => void;
  actionBusy?: boolean;
}

const TONES: Record<SheetPhaseTone, { fg: string; bg: string }> = {
  neutral: { fg: colors.primary, bg: colors.neutralAccent },
  progress: { fg: colors.warning, bg: colors.warningBg },
  done: { fg: colors.success, bg: colors.successBg },
};

/** One sheet on the production screen: what it is, where it is, what is next. */
export function SheetRow({
  colorId,
  customHex,
  repeats,
  repeatCodes,
  phaseLabel,
  phaseTone = 'neutral',
  actionLabel,
  onPressAction,
  actionBusy = false,
}: SheetRowProps) {
  const label = getSwatch(colorId)?.label ?? colorId;
  const tone = TONES[phaseTone];

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <ColorSwatch colorId={colorId} customHex={customHex} size={22} interactive={false} />
        <Text style={[type.bodyStrong, styles.name]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={type.label}>
          {repeats} {repeats === 1 ? 'repeat' : 'repeats'}
        </Text>
      </View>

      <View style={styles.chips}>
        {repeatCodes.map((code) => (
          <View key={code} style={styles.chip}>
            <Text style={type.code}>{code}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <View style={[styles.phase, { backgroundColor: tone.bg }]}>
          <Text style={[type.pill, { color: tone.fg }]}>{phaseLabel}</Text>
        </View>
        {actionLabel && onPressAction ? (
          <Button
            label={actionLabel}
            tone="secondary"
            loading={actionBusy}
            onPress={onPressAction}
            style={styles.action}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.tight,
    paddingVertical: spacing.tight + 2,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  name: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.hair + 2,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.icon - 4,
    backgroundColor: colors.bg,
    borderWidth: layout.hairline,
    borderColor: colors.borderSubtle,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
  },
  phase: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  action: {
    height: 38,
    paddingHorizontal: spacing.content - 2,
  },
});
