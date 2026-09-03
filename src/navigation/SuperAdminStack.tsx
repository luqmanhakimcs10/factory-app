import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { PlatformDashboardScreen } from '../features/super-admin/dashboard/DashboardScreen';
import { FactoryDetailScreen } from '../features/super-admin/factory-detail/FactoryDetailScreen';

/**
 * The platform operator's console.
 *
 * Registered by `RootNavigator` only when the signed-in profile carries
 * `is_platform_admin`. That is deliberate belt-and-braces: the RLS policies in
 * `0011_super_admin.sql` already return nothing to anyone else, but an
 * unreachable screen is a stronger guarantee than an empty one, and it means a
 * factory employee with this app installed has no route here to stumble onto.
 */
export type SuperAdminStackParamList = {
  PlatformDashboard: undefined;
  PlatformFactoryDetail: { factoryId: string };
};

const Stack = createNativeStackNavigator<SuperAdminStackParamList>();

export function SuperAdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PlatformDashboard" component={PlatformDashboardScreen} />
      <Stack.Screen name="PlatformFactoryDetail" component={FactoryDetailScreen} />
    </Stack.Navigator>
  );
}
