import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';

import { StaffDashboardScreen } from '../features/staff/StaffDashboardScreen';
import { MoveHubScreen } from '../features/staff/movement/MoveHubScreen';
import { DropOffScreen } from '../features/staff/movement/DropOffScreen';
import { PickUpScreen } from '../features/staff/movement/PickUpScreen';
import { DeliveryQueueScreen } from '../features/staff/delivery/DeliveryQueueScreen';
import { DeliverScreen } from '../features/staff/delivery/DeliverScreen';
import { DeliveryDoneScreen } from '../features/staff/delivery/DeliveryDoneScreen';
import { ReturnQueueScreen } from '../features/staff/returns/ReturnQueueScreen';
import { RaiseReturnScreen } from '../features/staff/returns/RaiseReturnScreen';
import { OrderTakerStack, type OrderTakerStackParamList } from './OrderTakerStack';
import { ProcurementStack, type ProcurementStackParamList } from './ProcurementStack';

/**
 * The unified staff persona — one login, capabilities granted per person.
 *
 * Order Taker and Procurement are nested here as whole navigators rather than
 * re-registered screen by screen. They are complete flows with their own
 * internal wizards and their own back behaviour, and flattening them into this
 * stack would mean this file has to know that New Client is a sub-step of Pick
 * Client. Nesting keeps that knowledge in the stack that owns it, and makes
 * `goBack` from either flow's root land on the Dashboard for free.
 *
 * Both nested roots take `cameFromDashboard`, which is what swaps their home
 * header for a back bar. A dedicated `order_taker` or `procurement` login
 * reaches the same screens through the same nested stack, but lands on the
 * Dashboard first — with a single implied grant, so the grid has exactly the
 * one card their old module root used to be.
 */
export type StaffStackParamList = {
  Dashboard: undefined;
  OrderTaker: NavigatorScreenParams<OrderTakerStackParamList>;
  Procurement: NavigatorScreenParams<ProcurementStackParamList>;
  MoveHub: undefined;
  DropOff: { movementId: string };
  PickUp: { movementId: string };
  DeliveryQueue: undefined;
  Deliver: { orderId: string };
  DeliveryDone: { orderCode: string; clientName: string };
  ReturnQueue: undefined;
  RaiseReturn: { returnRequestId: string };
};

const Stack = createNativeStackNavigator<StaffStackParamList>();

export function StaffStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={StaffDashboardScreen} />
      <Stack.Screen name="OrderTaker" component={OrderTakerStack} />
      <Stack.Screen name="Procurement" component={ProcurementStack} />
      <Stack.Screen name="MoveHub" component={MoveHubScreen} />
      <Stack.Screen name="DropOff" component={DropOffScreen} />
      <Stack.Screen name="PickUp" component={PickUpScreen} />
      <Stack.Screen name="DeliveryQueue" component={DeliveryQueueScreen} />
      <Stack.Screen name="Deliver" component={DeliverScreen} />
      <Stack.Screen
        name="DeliveryDone"
        component={DeliveryDoneScreen}
        // The delivery is recorded by the time this shows; swiping back into
        // Deliver would offer to mark an order the RPC now rejects.
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="ReturnQueue" component={ReturnQueueScreen} />
      <Stack.Screen name="RaiseReturn" component={RaiseReturnScreen} />
    </Stack.Navigator>
  );
}
