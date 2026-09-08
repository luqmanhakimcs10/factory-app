import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { colors, fonts, layout, radius, spacing } from '../theme';

export type CodeChipState = 'default' | 'selected' | 'damaged' | 'ok';

export interface CodeChipProps {
  /** One physical repeat code, e.g. `0819-2.1`. */
  code: string;
  state?: CodeChipState;
  onPress?: () => void;
  style?: ViewStyle;
}

const STATES: Record<CodeChipState, { fg: string; bg: string; border: string }> = {
  default: { fg: colors.textSecondary, bg: colors.bg, border: colors.border },
  selected: { fg: colors.primary, bg: colors.neutralAccent, border: colors.primary },
  damaged: { fg: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder },
  ok: { fg: colors.success, bg: colors.successBg, border: colors.success },
};

/**
 * A single physical repeat, as a chip.
 *
 * The unit the delivery flows actually count is one repeat, not one sheet — a
 * partner can damage repeat 3 of a five-repeat sheet and return the other four
 * intact — so the code is the thing that carries state, and the colour is how
 * it says which. Reused unchanged across Movement, Delivery and Return so a
 * code means the same thing wherever it appears.
 */
export function CodeChip({ code, state = 'default', onPress, style }: CodeChipProps) {
  const palette = STATES[state];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected: state !== 'default' } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && onPress ? styles.pressed : null,
        style,
      ]}
    >
      <Text style={[styles.label, { color: palette.fg }]} numberOfLines={1}>
        {code}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.tight + 2,
    paddingVertical: spacing.hair + 1,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
  },
  pressed: {
    opacity: 0.75,
  },
  label: {
    fontFamily: fonts.mono.medium,
    fontSize: 12,
    lineHeight: 16,
  },
});
