import { StyleSheet, Text, View } from 'react-native';

import { colors, layout, spacing, type } from '../theme';
import { ColorSwatch } from './ColorSwatch';

export interface ItemRowProps {
  /** SWATCHES key, or null when the fill comes from `hex`. */
  colorId: string | null;
  hex?: string | null;
  label: string;
  /** Already formatted by the caller — weight for thread, "N pcs" for bobbin. */
  quantity: string;
  price: string;
}

/** One purchase-order line: what it is, how much of it, what it costs. */
export function ItemRow({ colorId, hex, label, quantity, price }: ItemRowProps) {
  return (
    <View style={styles.row}>
      {colorId ? (
        <ColorSwatch colorId={colorId} customHex={hex} size={20} interactive={false} />
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
        <Text style={type.body} numberOfLines={1}>
          {label}
        </Text>
        <Text style={type.caption}>{quantity}</Text>
      </View>

      <Text style={[type.code, styles.price]}>{price}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingVertical: spacing.tight,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  plainSwatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  plainSwatchEmpty: {
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  text: {
    flex: 1,
  },
  price: {
    fontSize: 15,
    color: colors.textPrimary,
  },
});
