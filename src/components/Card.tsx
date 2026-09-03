import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, layout, radius, spacing, type } from '../theme';

export type CardTone = 'default' | 'danger';

export interface CardProps {
  /** Optional heading rendered above the card body. */
  title?: string;
  tone?: CardTone;
  children: React.ReactNode;
  style?: ViewStyle;
}

/** The white surface block every screen composes its content out of. */
export function Card({ title, tone = 'default', children, style }: CardProps) {
  return (
    <View style={[styles.card, tone === 'danger' && styles.danger, style]}>
      {title ? <Text style={type.heading}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.content - 2,
    gap: spacing.tight + 2,
  },
  danger: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
});
