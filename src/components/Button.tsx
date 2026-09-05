import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';

export type ButtonTone =
  | 'primary'
  | 'secondary'
  /** Navy rule and navy label on white — the "+ Add ..." roster button. */
  | 'outline'
  | 'ghost'
  | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  icon?: React.ComponentProps<typeof Feather>['name'];
  disabled?: boolean;
  loading?: boolean;
  /** Grow to fill a bottom bar that holds two buttons. */
  flex?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  icon,
  disabled = false,
  loading = false,
  flex = false,
  style,
}: ButtonProps) {
  const inert = disabled || loading;
  const palette = TONES[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        flex && styles.flex,
        pressed && !inert && styles.pressed,
        inert && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <View style={styles.inner}>
          {icon ? <Feather name={icon} size={16} color={palette.fg} /> : null}
          <Text style={[type.button, { color: palette.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const TONES: Record<ButtonTone, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.surface, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.textPrimary, border: colors.border },
  outline: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.textSecondary, border: 'transparent' },
  danger: { bg: colors.danger, fg: colors.surface, border: colors.danger },
};

const styles = StyleSheet.create({
  button: {
    height: layout.bottomBarHeight,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.content,
  },
  flex: {
    flex: 1,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight - 2,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
});
