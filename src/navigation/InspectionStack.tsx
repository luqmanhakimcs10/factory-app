import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CompleteScreen } from '../features/inspection/screens/CompleteScreen';
import { InspectScreen } from '../features/inspection/screens/InspectScreen';
import { InspectionQueueScreen } from '../features/inspection/screens/InspectionQueueScreen';
import { ReportDefectScreen } from '../features/inspection/screens/ReportDefectScreen';

/**
 * QA Initial Inspection.
 *
 * Not a wizard — a queue feeding a per-unit review loop, so there are no
 * progress dots anywhere in this module. Advancing between units replaces the
 * Inspect route rather than pushing it, so a twelve-repeat order does not leave
 * twelve screens on the back stack.
 *
 * The "proof photo from intake" reference on Inspect reads
 * `orders.proof_photo_url`: one photo covering the whole order. There is no
 * per-sheet proof photo.
 */
export type InspectionStackParamList = {
  InspectionQueue: undefined;
  Inspect: { orderId: string; unitId: string };
  ReportDefect: { orderId: string; unitId: string };
  Complete: { orderId: string };
};

const Stack = createNativeStackNavigator<InspectionStackParamList>();

export function InspectionStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InspectionQueue" component={InspectionQueueScreen} />
      <Stack.Screen name="Inspect" component={InspectScreen} />
      <Stack.Screen name="ReportDefect" component={ReportDefectScreen} />
      <Stack.Screen
        name="Complete"
        component={CompleteScreen}
        // The order is fully decided by now; backing into the last unit would
        // show a screen whose buttons no longer apply.
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
