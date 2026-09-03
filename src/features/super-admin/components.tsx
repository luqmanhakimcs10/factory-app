import { useContext } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { NavigationContext, StackActions } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';

import { confirmSignOut } from '../auth/signOut';
import {
  platformColors,
  platformLayout,
  platformRadius,
  platformSpacing,
  platformType,
} from '../../theme-platform';

/**
 * The console's own primitives.
 *
 * Kept here rather than in `/src/components` on purpose: everything in that
 * folder is built from the factory-floor theme, and importing one of those
 * would drag navy/IBM Plex tokens into a module whose whole point is to look
 * like a different product.
 */

/**
 * The console's header, on every screen in it.
 *
 * The same component as the factory-floor `TopBar` in every respect except the
 * theme tokens, and it exists for the same reason: Home and Sign out are drawn
 * here rather than passed in, so a console screen cannot quietly ship without
 * them. Home pops to the stack root, which for this stack is the Platform
 * Dashboard.
 */
export function PlatformTopBar({
  title,
  subtitle,
  onPressBack,
  /** Screen-specific action, e.g. the dashboard's Add button. */
  trailing,
}: {
  title: string;
  subtitle?: string;
  onPressBack?: () => void;
  trailing?: React.ReactNode;
}) {
  const navigation = useContext(NavigationContext);

  return (
    <View style={styles.topBar}>
      {onPressBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          onPress={onPressBack}
        >
          <Feather name="chevron-left" size={24} color={platformColors.textPrimary} />
        </Pressable>
      ) : null}

      {navigation ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Home"
          hitSlop={10}
          onPress={() => navigation.dispatch(StackActions.popToTop())}
        >
          <Feather name="home" size={20} color={platformColors.textPrimary} />
        </Pressable>
      ) : null}

      <View style={styles.topBarText}>
        <Text style={platformType.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={platformType.caption} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        hitSlop={10}
        onPress={confirmSignOut}
        style={styles.topBarSignOut}
      >
        <Feather name="log-out" size={20} color={platformColors.textSecondary} />
      </Pressable>
    </View>
  );
}

export function PlatformCard({
  children,
  style,
  accentBorder,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Left rule colour — used to tint a payment row by its status. */
  accentBorder?: string;
}) {
  return (
    <View
      style={[
        styles.card,
        accentBorder ? { borderLeftWidth: 4, borderLeftColor: accentBorder } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: color }]}>
      <Text style={platformType.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={platformType.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
  const active = status === 'active';
  const color = active ? platformColors.accentSuccess : platformColors.accentError;
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1a`, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{active ? 'Active' : 'Inactive'}</Text>
    </View>
  );
}

export function PlatformButton({
  label,
  onPress,
  tone = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger' | 'quiet';
  icon?: React.ComponentProps<typeof Feather>['name'];
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const fill =
    tone === 'primary'
      ? platformColors.accentPrimary
      : tone === 'secondary'
        ? platformColors.accentSecondary
        : tone === 'danger'
          ? platformColors.accentError
          : platformColors.bgSurface;
  const quiet = tone === 'quiet';
  const fg = quiet ? platformColors.textPrimary : '#ffffff';
  const inert = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inert) }}
      disabled={inert}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: fill },
        quiet ? styles.buttonQuiet : null,
        inert ? styles.buttonInert : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={16} color={fg} /> : null}
          <Text style={[styles.buttonLabel, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** One label/value pair in a detail grid. */
export function InfoCell({
  label,
  value,
  children,
  full,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  /** Span the whole row rather than sharing it with a sibling. */
  full?: boolean;
}) {
  return (
    <View style={[styles.cell, full ? styles.cellFull : null]}>
      <Text style={platformType.label}>{label}</Text>
      {children ?? (
        <Text style={platformType.body} numberOfLines={2}>
          {value && value.length > 0 ? value : '—'}
        </Text>
      )}
    </View>
  );
}

export function ChipRow<T extends string>({
  options,
  selected,
  onToggle,
  multi = true,
}: {
  options: { id: T; label: string }[];
  selected: T[];
  onToggle: (id: T) => void;
  multi?: boolean;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const on = selected.includes(option.id);
        return (
          <Pressable
            key={option.id}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(option.id)}
            style={[styles.chip, on ? styles.chipOn : null]}
          >
            <Text style={[styles.chipLabel, on ? styles.chipLabelOn : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Inline validation message. This module never uses a native `alert()`. */
export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.error}>
      <Feather name="alert-circle" size={15} color={platformColors.accentError} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: platformSpacing.tight,
    paddingHorizontal: platformSpacing.content,
    paddingVertical: platformSpacing.block,
    borderBottomWidth: platformLayout.hairline,
    borderBottomColor: platformColors.border,
  },
  topBarText: { flex: 1 },
  topBarSignOut: { paddingHorizontal: platformSpacing.hair },
  card: {
    backgroundColor: platformColors.bgSurface,
    borderRadius: platformRadius.card,
    borderWidth: platformLayout.hairline,
    borderColor: platformColors.border,
    padding: platformSpacing.content - 2,
    gap: platformSpacing.tight,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 84,
    borderRadius: platformRadius.card,
    padding: platformSpacing.content - 4,
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: platformRadius.badge,
    borderWidth: platformLayout.hairline,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: platformSpacing.content,
    borderRadius: platformRadius.card,
  },
  buttonQuiet: {
    borderWidth: platformLayout.hairline,
    borderColor: platformColors.border,
  },
  buttonInert: { opacity: 0.45 },
  buttonLabel: { fontSize: 14, fontWeight: '600' },
  cell: {
    flexGrow: 1,
    flexBasis: '46%',
    gap: 2,
  },
  cellFull: { flexBasis: '100%' },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: platformSpacing.tight,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: platformRadius.chip,
    borderWidth: platformLayout.hairline,
    borderColor: platformColors.border,
    backgroundColor: platformColors.bgSurface,
  },
  chipOn: {
    backgroundColor: platformColors.accentPrimary,
    borderColor: platformColors.accentPrimary,
  },
  chipLabel: { fontSize: 13, fontWeight: '600', color: platformColors.textSecondary },
  chipLabelOn: { color: '#ffffff' },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: platformSpacing.hair,
  },
  errorText: { fontSize: 13, color: platformColors.accentError, flex: 1 },
});
