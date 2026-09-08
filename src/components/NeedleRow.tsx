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
  /**
   * This row's values were read off a photographed design sheet and nobody has
   * checked them against the paper yet.
   *
   * The stitch field is outlined rather than filled in, and carries a tap-to-
   * confirm affordance instead of the edit pencil. A machine-read number that
   * looks identical to a typed one is the failure this whole flow exists to
   * avoid: it drives thread purchasing and machine hours, and a misread digit
   * is only expensive once it has been acted on.
   */
  unconfirmed?: boolean;
  /** Accept the read value as correct. Required when `unconfirmed` is set. */
  onConfirm?: () => void;
}

/** Editable needle assignment: which needle runs this colour, for how long. */
export function NeedleRow({
  colorId,
  customHex,
  needle,
  stitches,
  onChangeNeedle,
  onEditStitches,
  unconfirmed = false,
  onConfirm,
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
        accessibilityLabel={
          unconfirmed
            ? `${stitches.toLocaleString()} stitches read from the sheet for ${label}. Tap to confirm, or long-press to correct.`
            : `Edit stitch count for ${label}`
        }
        onPress={unconfirmed ? onConfirm : onEditStitches}
        // Correcting a read value stays one gesture away rather than behind a
        // confirm-then-edit round trip: the common case for a wrong number is
        // that the floor manager can already see the right one on the paper.
        onLongPress={unconfirmed ? onEditStitches : undefined}
        style={[styles.stitchField, unconfirmed && styles.stitchFieldUnconfirmed]}
      >
        <Text
          style={[type.code, styles.stitchValue, unconfirmed && styles.stitchValueUnconfirmed]}
        >
          {stitches.toLocaleString()}
        </Text>
        <Feather
          name={unconfirmed ? 'check' : 'edit-2'}
          size={12}
          color={unconfirmed ? colors.warning : colors.textMuted}
        />
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
  stitchFieldUnconfirmed: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  stitchValue: {
    color: colors.textPrimary,
  },
  stitchValueUnconfirmed: {
    color: colors.warning,
  },
});
