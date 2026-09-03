import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, type } from '../theme';
import { ColorSwatch } from './ColorSwatch';
import { StatusPill, type PillStatus } from './StatusPill';
import { isActiveVariant, isDisabledVariant, type InteractiveVariant } from './variants';

/** A colour on the card's swatch row — one per sheet on the order. */
export interface OrderCardSwatch {
  colorId: string;
  customHex?: string | null;
}

export interface OrderCardProps {
  /** Order code, rendered mono + secondary. */
  code: string;
  status: PillStatus;
  clientName: string;
  /** Date for finished orders, progress text ("4 of 12 checked") while running. */
  meta?: string;
  swatches?: OrderCardSwatch[];
  variant?: InteractiveVariant;
  onPress?: () => void;
}

/** The row unit of every queue and list screen. */
export function OrderCard({
  code,
  status,
  clientName,
  meta,
  swatches = [],
  variant = 'default',
  onPress,
}: OrderCardProps) {
  const selected = isActiveVariant(variant);
  const disabled = isDisabledVariant(variant);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[styles.card, selected && styles.selected, disabled && styles.disabled]}
    >
      <View style={styles.headerRow}>
        <Text style={type.code}>{code}</Text>
        <StatusPill status={status} />
      </View>

      <Text style={type.bodyStrong} numberOfLines={1}>
        {clientName}
      </Text>

      {meta ? (
        <Text style={type.label} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}

      {swatches.length > 0 ? (
        <View style={styles.swatchRow}>
          {swatches.map((swatch, index) => (
            <ColorSwatch
              key={`${swatch.colorId}-${index}`}
              colorId={swatch.colorId}
              customHex={swatch.customHex}
              size={16}
              interactive={false}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.content - 2,
    gap: spacing.hair,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.tight - 2,
  },
  selected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.5,
  },
});
