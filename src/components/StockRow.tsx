import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, type } from '../theme';
import { ColorSwatch } from './ColorSwatch';

export interface StockRowProps {
  /** SWATCHES key, or null when the fill comes from `hex` (tilla shades). */
  colorId: string | null;
  /** Direct fill, used for tilla and custom colours. */
  hex?: string | null;
  /** "Red" for thread, "Red · 3mm · Cut" for sequin. */
  label: string;
  code: string;
  /** Primary quantity line, e.g. "1,200 g" or "14 CDs". */
  quantity: string;
  /**
   * Second quantity line. Sequin piece counts only — always computed from the
   * roll count, never typed in, so it renders muted and read-only.
   */
  computedQuantity?: string;
  lowStock?: boolean;
  onPress?: () => void;
}

export function StockRow({
  colorId,
  hex,
  label,
  code,
  quantity,
  computedQuantity,
  lowStock = false,
  onPress,
}: StockRowProps) {
  const content = (
    <View style={styles.row}>
      {colorId ? (
        <ColorSwatch colorId={colorId} customHex={hex} size={28} interactive={false} />
      ) : (
        <View
          style={[
            styles.plainSwatch,
            { backgroundColor: hex ?? colors.borderSubtle },
            !hex && styles.plainSwatchEmpty,
          ]}
        />
      )}

      <View style={styles.text}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {label}
        </Text>
        <Text style={type.code}>{code}</Text>
      </View>

      <View style={styles.quantities}>
        <Text style={[type.code, styles.quantity]}>{quantity}</Text>
        {computedQuantity ? (
          <Text style={type.caption}>{computedQuantity}</Text>
        ) : null}
      </View>

      {lowStock ? (
        <View style={styles.lowStock}>
          <Text style={[type.pill, styles.lowStockLabel]}>Low Stock</Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingVertical: spacing.tight + 2,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  plainSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  plainSwatchEmpty: {
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  text: {
    flex: 1,
  },
  quantities: {
    alignItems: 'flex-end',
  },
  quantity: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  lowStock: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerBg,
  },
  lowStockLabel: {
    color: colors.danger,
  },
});
