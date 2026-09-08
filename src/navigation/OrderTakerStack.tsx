import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DesignSheetScreen } from '../features/order-taker/screens/DesignSheetScreen';
import { NewClientScreen } from '../features/order-taker/screens/NewClientScreen';
import { OrderDetailScreen } from '../features/order-taker/screens/OrderDetailScreen';
import { OrderPhotoScreen } from '../features/order-taker/screens/OrderPhotoScreen';
import { OrdersListScreen } from '../features/order-taker/screens/OrdersListScreen';
import { PickClientScreen } from '../features/order-taker/screens/PickClientScreen';
import { ReviewScreen } from '../features/order-taker/screens/ReviewScreen';
import { SheetCountScreen } from '../features/order-taker/screens/SheetCountScreen';
import { SheetFormScreen } from '../features/order-taker/screens/SheetFormScreen';
import { SubmittedScreen } from '../features/order-taker/screens/SubmittedScreen';

/**
 * Order Taker module.
 *
 * The wizard is linear: PickClient -> (NewClient) -> SheetCount -> OrderPhoto
 * -> SheetForm (loops per sheet) -> DesignSheet -> Review -> Submitted.
 * New Client is a sub-step of Pick Client and shares its progress dot, so the
 * indicator has six dots across ten screens.
 *
 * `OrdersList` takes `cameFromDashboard` because this stack is not a module
 * root any more — it is nested inside `StaffStack`, and the person who opened
 * it has a Dashboard to go back to. The flag drives the header variant only;
 * everything below it is the same screen either way.
 */
export type OrderTakerStackParamList = {
  OrdersList: { cameFromDashboard?: boolean } | undefined;
  OrderDetail: { orderId: string };
  PickClient: undefined;
  NewClient: undefined;
  SheetCount: undefined;
  OrderPhoto: undefined;
  SheetForm: undefined;
  DesignSheet: undefined;
  Review: undefined;
  Submitted: { orderCode: string };
};

const Stack = createNativeStackNavigator<OrderTakerStackParamList>();

export function OrderTakerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OrdersList" component={OrdersListScreen} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
      <Stack.Screen name="PickClient" component={PickClientScreen} />
      <Stack.Screen name="NewClient" component={NewClientScreen} />
      <Stack.Screen name="SheetCount" component={SheetCountScreen} />
      <Stack.Screen name="OrderPhoto" component={OrderPhotoScreen} />
      <Stack.Screen name="SheetForm" component={SheetFormScreen} />
      <Stack.Screen name="DesignSheet" component={DesignSheetScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen
        name="Submitted"
        component={SubmittedScreen}
        // The order is written by the time this shows; swiping back into the
        // wizard would offer to submit it a second time.
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
