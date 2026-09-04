import { useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContext, StackActions } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';

import { colors, fonts, layout, radius, spacing, type } from '../theme';
import { confirmSignOut } from '../features/auth/signOut';
import { ROLE_LABELS } from '../navigation/roleStacks';
import { useSession } from '../state/session';

interface HomeTopBarProps {
  variant: 'home';
  /** Omit to hide the bell entirely. */
  onPressNotifications?: () => void;
  /** Unread count for the bell badge. Zero or undefined renders no badge. */
  notificationCount?: number;
  /**
   * Drop the sign-out button from this root.
   *
   * Only pass `false` from a module whose every sub-screen is one tap away and
   * carries the `bar` header — that is what keeps sign-out reachable. It exists
   * because the dashboard mockup puts the bell alone on the right and treats
   * sign-out as belonging to a settings surface; until that surface exists,
   * the sub-screen headers are the fallback.
   */
  showSignOut?: boolean;
}

interface BarTopBarProps {
  variant: 'bar';
  title: string;
  onPressBack?: () => void;
  /** Right-hand indicator: step counter, unit count, save state. */
  trailing?: string;
}

export type TopBarProps = HomeTopBarProps | BarTopBarProps;

/**
 * The top of every screen. `home` on module roots, `bar` on every sub-screen —
 * no screen draws its own header.
 *
 * Sign out is rendered by this component rather than passed in. It was
 * originally a per-module prop, and per-module props are what let sign-out go
 * missing from four of the five modules twice: a module that forgets the prop
 * silently loses the action, and nothing fails. `showSignOut` is the one
 * deliberate opt-out, and it is documented above rather than left to a caller
 * to rediscover.
 *
 * There is no Home button on the `home` variant: that variant only ever renders
 * on a module root, so "go home" is a no-op from there. It stays on `bar`,
 * where there is actually a stack to pop.
 *
 * The identity block reads the factory name and the role off the session rather
 * than taking them as props — passing them in is what let five module roots
 * drift into five hardcoded role labels. The second line is the role's display
 * label from `ROLE_LABELS`, never `profiles.role` itself: that column holds the
 * `user_role` enum (`company_admin`), which is an internal identifier and not
 * user-facing copy.
 */
export function TopBar(props: TopBarProps) {
  const insets = useSafeAreaInsets();
  const profile = useSession((state) => state.profile);
  const factoryName = useSession((state) => state.factoryName);
  const goHome = useGoHome();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.row, props.variant === 'home' && styles.homeRow]}>
        {props.variant === 'home' ? (
          <>
            <View style={styles.identity}>
              <Text style={styles.brand} numberOfLines={1}>
                {factoryName ?? 'My Factory'}
              </Text>
              <Text style={styles.role} numberOfLines={1}>
                {profile ? ROLE_LABELS[profile.role].toUpperCase() : ''}
              </Text>
            </View>
            {props.onPressNotifications ? (
              <NotificationBell
                count={props.notificationCount}
                onPress={props.onPressNotifications}
              />
            ) : null}
            {props.showSignOut === false ? null : <SignOutButton />}
          </>
        ) : (
          <>
            {props.onPressBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={10}
                onPress={props.onPressBack}
                style={styles.iconButton}
              >
                <Feather name="chevron-left" size={24} color={colors.textPrimary} />
              </Pressable>
            ) : (
              <View style={styles.iconButton} />
            )}
            <HomeButton onPress={goHome} />
            <Text style={[type.title, styles.title]} numberOfLines={1}>
              {props.title}
            </Text>
            {props.trailing ? (
              <Text style={[type.code, styles.trailing]} numberOfLines={1}>
                {props.trailing}
              </Text>
            ) : null}
            <SignOutButton />
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Back to the current role's own landing screen.
 *
 * `popToTop` rather than a navigate: every module's stack is registered with
 * its landing screen first — Orders List, Inspection Queue, Floor Manager
 * Dashboard, Store Manager Home, Ledgers, Company Admin Dashboard — so the
 * role's root is whatever is at the bottom of the stack this header is mounted
 * in. That means one implementation covers every module without a role lookup,
 * and it pops rather than pushes, so tapping Home five times leaves one screen
 * on the stack instead of six.
 *
 * Read through `NavigationContext` rather than `useNavigation` so a TopBar
 * rendered outside a navigator degrades to a no-op button instead of throwing.
 */
function useGoHome(): (() => void) | undefined {
  const navigation = useContext(NavigationContext);
  if (!navigation) return undefined;
  return () => navigation.dispatch(StackActions.popToTop());
}

function HomeButton({ onPress }: { onPress?: () => void }) {
  if (!onPress) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Home"
      hitSlop={10}
      onPress={onPress}
      style={styles.iconButton}
    >
      <Feather name="home" size={20} color={colors.textPrimary} />
    </Pressable>
  );
}

function NotificationBell({
  count,
  onPress,
}: {
  count?: number;
  onPress: () => void;
}) {
  // Nothing unread means no badge at all, rather than a badge reading "0".
  const unread = count && count > 0 ? count : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unread ? `Notifications, ${unread} unread` : 'Notifications'
      }
      hitSlop={10}
      onPress={onPress}
      style={styles.bellButton}
    >
      <Feather name="bell" size={20} color={colors.textSecondary} />
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function SignOutButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      hitSlop={10}
      onPress={confirmSignOut}
      style={styles.iconButton}
    >
      <Feather name="log-out" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.border,
  },
  row: {
    minHeight: layout.topBarHeight,
    paddingHorizontal: spacing.content,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  /** The home header has its own padding: `20px 20px 16px` in the mockup. */
  homeRow: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  identity: {
    flex: 1,
  },
  brand: {
    fontFamily: fonts.condensed.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  role: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.55,
    marginTop: 2,
    color: colors.textSecondary,
  },
  title: {
    flex: 1,
  },
  trailing: {
    textAlign: 'right',
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: radius.icon,
    backgroundColor: colors.controlBg,
    alignItems: 'center',
    justifyContent: 'center',
    // Anchors the badge, which overhangs the button's top-right corner.
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.mono.bold,
    fontSize: 10,
    lineHeight: 16,
    color: colors.surface,
    textAlign: 'center',
  },
});
