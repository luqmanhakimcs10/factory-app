import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, spacing, type } from '../theme';

export interface EmptyStateProps {
  title: string;
  /** One line of guidance on what to do about it. */
  hint?: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  style?: ViewStyle;
}

/** Centred muted placeholder for empty lists and queues. */
export function EmptyState({ title, hint, icon = 'inbox', style }: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <Feather name={icon} size={28} color={colors.textMuted} />
      <Text style={[type.body, styles.title]}>{title}</Text>
      {hint ? <Text style={[type.label, styles.hint]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.content * 3,
    paddingHorizontal: spacing.content,
    gap: spacing.tight,
  },
  title: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  hint: {
    color: colors.textMuted,
    textAlign: 'center',
  },
});
