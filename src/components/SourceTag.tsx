import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, radius, type } from '../theme';

export interface SourceTagProps {
  /** MANUAL / SYSTEM-GENERATED, or any short uppercase provenance label. */
  label: string;
  style?: ViewStyle;
}

/** Small uppercase chip marking where a record came from. */
export function SourceTag({ label, style }: SourceTagProps) {
  return (
    <View style={[styles.tag, style]}>
      <Text style={[type.pill, styles.label]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralAccent,
  },
  label: {
    color: colors.primary,
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
