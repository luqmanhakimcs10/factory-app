import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';
import { getSwatch } from '../data/swatches';
import { ColorSwatch } from './ColorSwatch';

const MIN_NEEDLE = 1;
const MAX_NEEDLE = 20;

export interface NeedleRowProps {
  colorId: string;
  customHex?: string | null;
  needle: number;
  stitches: number;
  onChangeNeedle: (needle: number) => void;
  /** Opens the numeric keypad — the caller owns the sheet. */
  onEditStitches: () => void;
}

/** Editable needle assignment: which needle runs this colour, for how long. */
export function NeedleRow({
  colorId,
  customHex,
  needle,
  stitches,
  onChangeNeedle,
  onEditStitches,
}: NeedleRowProps) {
  const label = getSwatch(colorId)?.label ?? colorId;

  const step = (delta: number) => {
    const next = Math.min(MAX_NEEDLE, Math.max(MIN_NEEDLE, needle + delta));
    if (next !== needle) onChangeNeedle(next);
  };

  return (
    <View style={styles.row}>
      <ColorSwatch colorId={colorId} customHex={customHex} size={28} interactive={false} />
      <Text style={[type.bodyStrong, styles.name]} numberOfLines={1}>
        {label}
      </Text>

      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease needle for ${label}`}
          disabled={needle <= MIN_NEEDLE}
          onPress={() => step(-1)}
          style={[styles.stepButton, needle <= MIN_NEEDLE && styles.stepDisabled]}
        >
          <Feather name="minus" size={14} color={colors.surface} />
        </Pressable>
        <Text style={[type.code, styles.needleValue]}>{needle}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase needle for ${label}`}
          disabled={needle >= MAX_NEEDLE}
          onPress={() => step(1)}
          style={[styles.stepButton, needle >= MAX_NEEDLE && styles.stepDisabled]}
        >
          <Feather name="plus" size={14} color={colors.surface} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit stitch count for ${label}`}
        onPress={onEditStitches}
        style={styles.stitchField}
      >
        <Text style={[type.code, styles.stitchValue]}>{stitches.toLocaleString()}</Text>
        <Feather name="edit-2" size={12} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

export interface MiniNeedleRowProps {
  colorId: string;
  customHex?: string | null;
  needle: number;
  stitches: number;
}

/** Read-only summary of the same data, for the Review screen. */
export function MiniNeedleRow({
  colorId,
  customHex,
  needle,
  stitches,
}: MiniNeedleRowProps) {
  const label = getSwatch(colorId)?.label ?? colorId;

  return (
    <View style={styles.miniRow}>
      <ColorSwatch colorId={colorId} customHex={customHex} size={16} interactive={false} />
      <Text style={[type.body, styles.name]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={type.code}>N{needle}</Text>
      <Text style={type.code}>{stitches.toLocaleString()} st</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    paddingVertical: spacing.tight,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    paddingVertical: spacing.hair + 2,
  },
  name: {
    flex: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.hair + 2,
  },
  stepButton: {
    width: 26,
    height: 26,
    borderRadius: radius.icon - 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: {
    opacity: 0.3,
  },
  needleValue: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 15,
    color: colors.textPrimary,
  },
  stitchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.hair,
    paddingHorizontal: spacing.tight,
    paddingVertical: spacing.hair + 2,
    borderRadius: radius.icon - 2,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    minWidth: 74,
    justifyContent: 'flex-end',
  },
  stitchValue: {
    color: colors.textPrimary,
  },
});
