import { useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContext, StackActions } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, spacing, type } from '../theme';
import { confirmSignOut } from '../features/auth/signOut';
import { useSession } from '../state/session';

interface HomeTopBarProps {
  variant: 'home';
  /** Omit to hide the bell entirely. */
  onPressNotifications?: () => void;
  /** Small dot on the bell when there is something unread. */
  hasNotifications?: boolean;
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
 * Home and Sign out are rendered by this component rather than passed in.
 * Both were originally per-module props, and per-module props are what let
 * sign-out go missing from four of the five modules twice: a module that
 * forgets the prop silently loses the action, and nothing fails. There is one
 * signed-in user and one stack to pop, so there is nothing for a caller to
 * decide — the only way to lose either button now is to stop using this
 * component.
 *
 * The `home` identity block reads the factory name, `profiles.full_name` and
 * `profiles.role` straight off the session for the same reason: passing them
 * in is what let five module roots drift into five hardcoded role labels that
 * did not name whoever was actually signed in.
 */
export function TopBar(props: TopBarProps) {
  const insets = useSafeAreaInsets();
  const profile = useSession((state) => state.profile);
  const factoryName = useSession((state) => state.factoryName);
  const goHome = useGoHome();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {props.variant === 'home' ? (
          <>
            <View style={styles.identity}>
              <Text style={type.brand} numberOfLines={1}>
                {factoryName ?? 'My Factory'}
              </Text>
              <Text style={type.label} numberOfLines={1}>
                {profile ? `${profile.full_name} — ${profile.role}` : ''}
              </Text>
            </View>
            <HomeButton onPress={goHome} />
            {props.onPressNotifications ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                hitSlop={10}
                onPress={props.onPressNotifications}
                style={styles.iconButton}
              >
                <Feather name="bell" size={20} color={colors.textPrimary} />
                {props.hasNotifications ? <View style={styles.dot} /> : null}
              </Pressable>
            ) : null}
            <SignOutButton />
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
 * Dashboard, Store Manager Home, Ledgers — so the role's root is whatever is
 * at the bottom of the stack this header is mounted in. That means one
 * implementation covers every module without a role lookup, and it pops rather
 * than pushes, so tapping Home five times leaves one screen on the stack
 * instead of six.
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
  identity: {
    flex: 1,
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
  dot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
});
