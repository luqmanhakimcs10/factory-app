import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, radius, spacing, type } from '../theme';

/**
 * `count`   — colour-count style: large navy circular buttons with ±1 and ±5.
 * `repeats` — repeats style: small square ± buttons, ±1 only.
 */
export type StepperSize = 'count' | 'repeats';

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  size?: StepperSize;
  min?: number;
  max?: number;
  /** Extra ±N buttons flanking the ±1 pair. `count` style defaults to 5. */
  bigStep?: number | null;
  disabled?: boolean;
  /** Text under the number, e.g. "colours" / "repeats". */
  unitLabel?: string;
  style?: ViewStyle;
}

export function Stepper({
  value,
  onChange,
  size = 'count',
  min = 0,
  max = 999,
  bigStep,
  disabled = false,
  unitLabel,
  style,
}: StepperProps) {
  const large = size === 'count';
  const step = bigStep === undefined ? (large ? 5 : null) : bigStep;

  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const apply = (delta: number) => onChange(clamp(value + delta));

  const button = (delta: number, label: string) => {
    const next = clamp(value + delta);
    const inert = disabled || next === value;
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inert }}
        disabled={inert}
        onPress={() => apply(delta)}
        style={[
          large ? styles.circle : styles.square,
          inert && styles.buttonDisabled,
        ]}
      >
        {Math.abs(delta) === 1 ? (
          <Feather
            name={delta > 0 ? 'plus' : 'minus'}
            size={large ? 22 : 16}
            color={colors.surface}
          />
        ) : (
          <Text style={[styles.bigStepLabel, !large && styles.bigStepLabelSmall]}>
            {label}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.row, style]}>
      {step ? button(-step, `-${step}`) : null}
      {button(-1, '-1')}

      <View style={styles.valueBox}>
        <Text style={[type.numeric, !large && styles.valueSmall]}>{value}</Text>
        {unitLabel ? <Text style={type.caption}>{unitLabel}</Text> : null}
      </View>

      {button(1, '+1')}
      {step ? button(step, `+${step}`) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight + 2,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  square: {
    width: 32,
    height: 32,
    borderRadius: radius.icon - 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  valueBox: {
    minWidth: 64,
    alignItems: 'center',
  },
  valueSmall: {
    fontSize: 20,
    lineHeight: 26,
  },
  bigStepLabel: {
    color: colors.surface,
    fontSize: 14,
    fontFamily: type.button.fontFamily,
  },
  bigStepLabelSmall: {
    fontSize: 11,
  },
});
