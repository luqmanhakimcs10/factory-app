import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';
import { STAGE_DEFS, STAGE_ORDER, type StageKey } from '../data/stageDefs';

export interface StageTileProps {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  selected: boolean;
  /** Locked tiles render selected and refuse input — Embroidery always runs. */
  locked?: boolean;
  onToggle?: () => void;
}

export function StageTile({ label, icon, selected, locked = false, onToggle }: StageTileProps) {
  const on = selected || locked;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: locked }}
      accessibilityLabel={label}
      disabled={locked || !onToggle}
      onPress={onToggle}
      style={[styles.tile, on && styles.tileOn, locked && styles.tileLocked]}
    >
      <Feather name={icon} size={20} color={on ? colors.primary : colors.textSecondary} />
      <Text style={[type.bodyStrong, styles.tileLabel, on && styles.labelOn]} numberOfLines={1}>
        {label}
      </Text>
      {locked ? (
        <Feather name="lock" size={13} color={colors.textMuted} />
      ) : (
        <Feather
          name={selected ? 'check-circle' : 'circle'}
          size={16}
          color={selected ? colors.primary : colors.border}
        />
      )}
    </Pressable>
  );
}

const STAGE_ICONS: Record<StageKey, React.ComponentProps<typeof Feather>['name']> = {
  clipping: 'scissors',
  piko: 'wind',
  press: 'layers',
};

export interface StageGridProps {
  /** Which optional stages are on. Embroidery is not part of this — it always runs. */
  value: Record<StageKey, boolean>;
  onChange: (next: Record<StageKey, boolean>) => void;
}

/** Embroidery (locked) plus the three independently toggleable finishing stages. */
export function StageGrid({ value, onChange }: StageGridProps) {
  return (
    <View style={styles.grid}>
      <StageTile label="Embroidery" icon="activity" selected locked />
      {STAGE_ORDER.map((key) => (
        <StageTile
          key={key}
          label={STAGE_DEFS[key].label}
          icon={STAGE_ICONS[key]}
          selected={value[key]}
          onToggle={() => onChange({ ...value, [key]: !value[key] })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.tight + 2,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    padding: spacing.content - 4,
    borderRadius: radius.tile,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileOn: {
    borderColor: colors.primary,
    backgroundColor: colors.neutralAccent,
  },
  tileLocked: {
    opacity: 0.9,
  },
  tileLabel: {
    flex: 1,
  },
  labelOn: {
    color: colors.primary,
  },
});
