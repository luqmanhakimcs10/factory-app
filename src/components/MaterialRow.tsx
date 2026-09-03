import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';
import { ColorSwatch } from './ColorSwatch';

export interface MaterialRowProps {
  colorId: string;
  customHex?: string | null;
  label: string;
  /** Formatted quantity, e.g. "120 g". */
  quantity: string;
  /** Read-only by default; `checkable` turns it into a checklist row. */
  checkable?: boolean;
  checked?: boolean;
  onToggle?: () => void;
}

/** One line of a materials request or collection checklist. */
export function MaterialRow({
  colorId,
  customHex,
  label,
  quantity,
  checkable = false,
  checked = false,
  onToggle,
}: MaterialRowProps) {
  const content = (
    <View style={styles.row}>
      <ColorSwatch colorId={colorId} customHex={customHex} size={20} interactive={false} />
      <Text style={[type.body, styles.label]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={type.code}>{quantity}</Text>
      {checkable ? (
        <View style={[styles.box, checked && styles.boxChecked]}>
          {checked ? <Feather name="check" size={14} color={colors.surface} /> : null}
        </View>
      ) : null}
    </View>
  );

  if (!checkable || !onToggle) return content;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingVertical: spacing.tight,
  },
  label: {
    flex: 1,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.icon - 4,
    borderWidth: layout.hairline + 0.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
});
