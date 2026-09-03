import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';

export interface NoteCardProps {
  text: string;
  title?: string;
  style?: ViewStyle;
}

/**
 * Amber informational banner.
 *
 * Deliberately distinct from the red alert card on Order Detail: this one says
 * "here is something you should know", not "something went wrong".
 */
export function NoteCard({ text, title, style }: NoteCardProps) {
  return (
    <View style={[styles.card, style]}>
      <Feather name="info" size={18} color={colors.warning} />
      <View style={styles.body}>
        {title ? <Text style={[type.bodyStrong, styles.title]}>{title}</Text> : null}
        <Text style={type.body}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.tight + 2,
    padding: spacing.content - 2,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.warning,
  },
});
