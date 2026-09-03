import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ComingSoonScreen } from '../features/store-manager/ComingSoonScreen';
import { StoreManagerHomeScreen } from '../features/store-manager/HomeScreen';
import { IssueDetailScreen } from '../features/store-manager/issue/IssueDetailScreen';

/**
 * Store Manager.
 *
 * The module root is a four-tab segmented control (Stock / PO's / Issue /
 * Audit); everything reachable from it is a route on this one stack.
 *
 * Only two destinations are real. The rest land on `ComingSoon`, because this
 * module was specced from six static list screenshots with no detail or
 * creation screens in them, and inventing those forms would bake in decisions
 * nobody has made.
 *
 * Its place in the order lifecycle is one transition: the Issue tab turns
 * `floor_status = 'materialRequested'` into `'readyToCollect'`, which is what
 * the Floor Manager's Requested Detail screen has been waiting on since it was
 * built. Collecting is the floor manager's side and is not duplicated here.
 */
export type StoreManagerStackParamList = {
  Home: undefined;
  IssueDetail: { orderId: string };
  ComingSoon: { title: string; note?: string };
};

const Stack = createNativeStackNavigator<StoreManagerStackParamList>();

export function StoreManagerTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={StoreManagerHomeScreen} />
      <Stack.Screen name="IssueDetail" component={IssueDetailScreen} />
      <Stack.Screen name="ComingSoon" component={ComingSoonScreen} />
    </Stack.Navigator>
  );
}
