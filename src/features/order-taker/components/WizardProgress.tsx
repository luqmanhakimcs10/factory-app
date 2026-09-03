import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../theme';

/** Wizard steps, in order. The Sheet Form loop stays on step 4 throughout. */
export const WIZARD_STEPS = 6;

export interface WizardProgressProps {
  /** 1-based. New Client is a sub-step of Pick Client and stays on 1. */
  step: number;
}

export function WizardProgress({ step }: WizardProgressProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: WIZARD_STEPS }, (_, index) => {
        const position = index + 1;
        return (
          <View
            key={position}
            style={[
              styles.dot,
              position === step && styles.current,
              position < step && styles.done,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.tight - 2,
    paddingVertical: spacing.tight + 2,
    backgroundColor: colors.surface,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  done: {
    backgroundColor: colors.primary,
    opacity: 0.45,
  },
  current: {
    width: 22,
    backgroundColor: colors.primary,
  },
});
