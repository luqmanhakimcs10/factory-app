import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors } from '../theme';
import { getSwatch, resolveSwatchHex } from '../data/swatches';
import { isActiveVariant, isDisabledVariant, type InteractiveVariant } from './variants';

/** Relative luminance of a `#rrggbb` fill, per WCAG 2.x. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [low, high] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => x - y,
  ) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/**
 * Ink that stays readable on a given swatch fill.
 *
 * The selection tick sits on top of any of the eleven fills, and those run from
 * `#F7F7F3` to `#1A1A1A`, so a fixed tick colour disappears at one end or the
 * other. Picking whichever of the two inks actually contrasts more — rather
 * than splitting on a luminance threshold — is what keeps the mid-tones
 * legible: on `yellow` a threshold puts the tick at 2.4:1, below the 3:1 floor
 * for non-text UI, where the other ink gives 6.9:1. Worst case across the
 * palette this way is 4.2:1.
 */
function tickColor(fill: string | null): string {
  // The `custom` placeholder has no fill, so the circle shows `surface`.
  if (!fill) return colors.textPrimary;

  return contrast(colors.surface, fill) >= contrast(colors.textPrimary, fill)
    ? colors.surface
    : colors.textPrimary;
}

export interface ColorSwatchProps {
  /** Key into `SWATCHES`, or `'custom'`. */
  colorId: string;
  /** Fill for the `custom` swatch once a picker exists. */
  customHex?: string | null;
  variant?: InteractiveVariant;
  size?: number;
  onPress?: () => void;
  style?: ViewStyle;
  /** Read-only decoration (e.g. the swatch row on an OrderCard). */
  interactive?: boolean;
}

export function ColorSwatch({
  colorId,
  customHex,
  variant = 'default',
  size = 32,
  onPress,
  style,
  interactive = true,
}: ColorSwatchProps) {
  const swatch = getSwatch(colorId);
  const fill = resolveSwatchHex(colorId, customHex);
  const selected = isActiveVariant(variant);
  const disabled = isDisabledVariant(variant);

  // The `custom` entry with no chosen colour renders as a dashed placeholder;
  // near-white swatches get their own outline so they stay visible on surface.
  const isPlaceholder = swatch?.isCustom === true && fill === null;

  const circle = (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: fill ?? colors.surface,
        },
        isPlaceholder && styles.placeholder,
        swatch?.bordered && !selected ? styles.bordered : null,
        selected && styles.selected,
        disabled && styles.disabled,
        style,
      ]}
    >
      {selected ? (
        <Feather name="check" size={size * 0.5} color={tickColor(fill)} />
      ) : isPlaceholder ? (
        <Feather name="plus" size={size * 0.5} color={colors.textMuted} />
      ) : null}
    </View>
  );

  // The ring is always in the tree and only changes colour, rather than being
  // wrapped around the circle on selection. Swapping the element structure on
  // select meant the first tap both re-parented the circle and grew the swatch
  // by 6pt, nudging the rest of the row — which reads as "nothing happened,
  // the layout just twitched" rather than as a selection.
  //
  // What the ring is filled with matters as much as that it exists. Tinting it
  // `borderSubtle` put it at 1.16:1 against the white card it sits on, i.e.
  // invisible, and the circle's own `primary` border was 1.00:1 on `royal`
  // (identical hex) and under 1.9:1 on black, green, purple and red. Selection
  // state was correct on the first tap the whole time — it just could not be
  // seen on eight of the ten palette colours, so the tap read as dropped.
  const content = (
    <View style={[styles.ring, selected && styles.ringActive]}>{circle}</View>
  );

  if (!interactive || !onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={swatch?.label ?? colorId}
      disabled={disabled}
      // The grid cell is a fifth of the screen but the swatch is only 44pt, so
      // without this the gap either side of each circle swallows taps.
      hitSlop={8}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordered: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textMuted,
  },
  /**
   * A surface-coloured gap between the fill and the ring, so the ring reads as
   * a ring on every fill — including `royal`, whose hex is `primary` itself.
   */
  selected: {
    borderWidth: 2.5,
    borderColor: colors.surface,
  },
  /** Soft outer ring behind the circle — tinted only while selected. */
  ring: {
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  ringActive: {
    backgroundColor: colors.primary,
  },
  disabled: {
    opacity: 0.4,
  },
});
