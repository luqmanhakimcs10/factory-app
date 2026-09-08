import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, type } from '../theme';

export interface PriceTapProps {
  /**
   * Formatted value, or null for the unset state.
   *
   * Null is not the same as zero here: an item priced at 0 is a decision
   * somebody made, and an item nobody has touched is the thing the screen is
   * asking about. They must not look alike.
   */
  value: string | null;
  /** The unset prompt — "Tap to price", "Qty", "Price". */
  placeholder?: string;
  /** Inert presentation, for a submitted bill reopened read-only. */
  disabled?: boolean;
  /** Accessibility label; without one the pill announces only its value. */
  label?: string;
  onPress: () => void;
  style?: ViewStyle;
}

/**
 * A small pill that stands in for a number nobody has entered yet.
 *
 * Two states, and the difference between them is the point: `unset` is tinted
 * danger, so an unpriced row is visible at a glance down a list of twelve;
 * `set` drops to neutral and gets out of the way. That is what makes "which of
 * these still needs a price" answerable without reading every row.
 *
 * One component rather than three inline variants — the Fulfill screen uses it
 * for a line-item price, an additional item's quantity and that item's price,
 * and those three drifting apart is exactly how "tap to price" ends up meaning
 * two different things on one screen.
 */
export function PriceTap({
  value,
  placeholder = 'Tap to price',
  disabled = false,
  label,
  onPress,
  style,
}: PriceTapProps) {
  const unset = value === null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (unset ? placeholder : value)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        unset ? styles.unset : styles.set,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.icon}>
        <Feather
          name={unset ? 'crosshair' : 'check'}
          size={12}
          color={unset ? colors.danger : colors.primary}
        />
      </View>
      <Text
        style={[type.code, unset ? styles.unsetLabel : styles.setLabel]}
        numberOfLines={1}
      >
        {value ?? placeholder}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
  },
  unset: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  set: {
    backgroundColor: colors.neutralAccent,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.75,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  unsetLabel: {
    fontSize: 13,
    color: colors.danger,
  },
  setLabel: {
    fontSize: 14,
    color: colors.primary,
  },
});
