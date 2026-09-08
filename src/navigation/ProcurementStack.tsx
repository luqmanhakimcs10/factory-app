import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { FulfillScreen } from '../features/procurement/fulfill/FulfillScreen';
import { QueueScreen } from '../features/procurement/queue/QueueScreen';
import { SubmittedScreen } from '../features/procurement/submitted/SubmittedScreen';

/**
 * Procurement.
 *
 * Three screens, linear: Queue -> Fulfill -> Submitted. No tabs and no wizard —
 * the module does exactly one thing, which is turn a manual purchase order that
 * has quantities into one that has prices and a bill.
 *
 * Its place in the order lifecycle is a handoff, not a stage. The store manager
 * raises a PO at `awaitingProcurement`; this module moves it to `submitted`;
 * the store manager confirms it to `confirmed`, which is what the Accountant's
 * Payables tab has always filtered on.
 *
 * `Queue` takes `cameFromDashboard` because this stack is no longer a module
 * root: Procurement is a grant now, and this navigator is nested inside
 * `StaffStack`. Reached from the Staff Dashboard, the header is a back bar
 * rather than a home bar. The home-bar branch stays for any route that mounts
 * this stack as a root of its own.
 */
export type ProcurementStackParamList = {
  Queue: { cameFromDashboard?: boolean } | undefined;
  Fulfill: { purchaseOrderId: string; readOnly: boolean };
  Submitted: { poNumber: string; supplierName: string; total: number };
};

const Stack = createNativeStackNavigator<ProcurementStackParamList>();

export function ProcurementStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Queue" component={QueueScreen} />
      <Stack.Screen name="Fulfill" component={FulfillScreen} />
      <Stack.Screen
        name="Submitted"
        component={SubmittedScreen}
        // The bill is written by the time this shows; swiping back into Fulfill
        // would offer to submit a PO the RPC now rejects.
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
