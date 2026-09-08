import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { SignInScreen } from '../features/auth/SignInScreen';
import { UnavailableRoleScreen } from '../features/auth/UnavailableRoleScreen';
import { useSession } from '../state/session';
import { useSessionBootstrap } from '../state/useSessionBootstrap';
import { ROLE_STACKS } from './roleStacks';
import { SuperAdminStack } from './SuperAdminStack';

/**
 * The signed-in user's `profiles.role` decides which module they get, and it is
 * the only thing that does.
 *
 * There is no picker and no menu: an employee has their own account and their
 * own device, so "their own dashboard" has to be literally true rather than a
 * disclaimer above a list of everyone else's modules. A role with no module
 * built yet sees a placeholder — never another role's screens, not even
 * read-only. RLS is the backstop for that rule, not the mechanism.
 *
 * Roles map onto the order lifecycle as follows:
 *   order_taker    intake, before `stage = 'inspection'`
 *   qa_person      `stage = 'inspection'`
 *   floor_manager  `stage = 'jobcard'` through `'production'`
 *   store_manager  the `materialRequested -> readyToCollect` handoff, plus stock
 *   accountant     money: invoices once an order is delivered, confirmed bills,
 *                  payroll, loans read-only, expenses raised for approval
 * Everything from `finishing` onward belongs to roles that do not exist yet.
 *
 * The map itself lives in `roleStacks.ts` because the fallback screen reads it
 * too — that is what stops the "currently covers ..." copy from naming a
 * different set of modules than the router actually serves.
 */
export function RootNavigator() {
  useSessionBootstrap();

  const profile = useSession((state) => state.profile);
  const factoryName = useSession((state) => state.factoryName);
  const loading = useSession((state) => state.loading);

  // Held until the profile resolves. Rendering a module before the role is
  // known would flash the wrong one at anybody whose session restores from
  // storage.
  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) return <SignInScreen />;

  // Checked before the role map, and deliberately not as another case inside
  // it. A platform operator is not a factory-scoped user: `ROLE_STACKS` is
  // keyed on the same `user_role` enum every tenant-scoped RLS policy branches
  // on, and putting a cross-tenant tier in there is how one typo in one policy
  // becomes a cross-tenant leak. The console is only ever mounted here, so for
  // anybody without the flag it is not a hidden screen — it does not exist.
  if (profile.is_platform_admin) {
    return (
      <NavigationContainer>
        <SuperAdminStack />
      </NavigationContainer>
    );
  }

  const RoleStack = ROLE_STACKS[profile.role];

  if (!RoleStack) {
    return (
      <UnavailableRoleScreen
        role={profile.role}
        fullName={profile.full_name}
        factoryName={factoryName}
      />
    );
  }

  return (
    <NavigationContainer>
      <RoleStack />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
