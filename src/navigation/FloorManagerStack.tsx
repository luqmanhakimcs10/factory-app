import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ComingSoonScreen } from '../features/floor-manager/dashboard/ComingSoonScreen';
import { DashboardScreen } from '../features/floor-manager/dashboard/DashboardScreen';
import { HomeScreen } from '../features/floor-manager/home/HomeScreen';
import { CollectDetailScreen } from '../features/floor-manager/inventory/CollectDetailScreen';
import { RequestedDetailScreen } from '../features/floor-manager/inventory/RequestedDetailScreen';
import { DesignSheetScreen } from '../features/floor-manager/job-card/DesignSheetScreen';
import { DetailsScreen } from '../features/floor-manager/job-card/DetailsScreen';
import { GeneratedScreen } from '../features/floor-manager/job-card/GeneratedScreen';
import { ReviewScreen } from '../features/floor-manager/job-card/ReviewScreen';
import { SentToStoreScreen } from '../features/floor-manager/job-card/SentToStoreScreen';
import { StagesScreen } from '../features/floor-manager/job-card/StagesScreen';
import { MachineDetailScreen } from '../features/floor-manager/machines/MachineDetailScreen';
import { SelectMachineScreen } from '../features/floor-manager/machines/SelectMachineScreen';
import { ProductionDetailScreen } from '../features/floor-manager/production/ProductionDetailScreen';
import { StageFormScreen } from '../features/floor-manager/production/StageFormScreen';

/**
 * Floor Manager: one dashboard plus five sub-workflows, all operating on the
 * shared `orders` / `order_sheets` rows.
 *
 * The Home tab is not a route param — see `homeTabStore` for why.
 */
export type FloorManagerStackParamList = {
  Dashboard: undefined;
  ComingSoon: { title: string };
  Home: undefined;

  // Job card
  JobCardDesignSheet: { orderId: string };
  JobCardDetails: { orderId: string };
  JobCardStages: { orderId: string };
  JobCardReview: { orderId: string };
  JobCardGenerated: { orderId: string };
  JobCardSentToStore: { orderId: string };

  // Inventory
  RequestedDetail: { orderId: string };
  CollectDetail: { orderId: string };

  // Machines
  SelectMachine: { orderId: string };
  MachineDetail: { machineId: string; fromAssignmentOrderId?: string };

  // Production
  ProductionDetail: { orderId: string };
  StageForm: { orderId: string; sheetId: string };
};

const Stack = createNativeStackNavigator<FloorManagerStackParamList>();

export function FloorManagerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="ComingSoon" component={ComingSoonScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />

      <Stack.Screen name="JobCardDesignSheet" component={DesignSheetScreen} />
      <Stack.Screen name="JobCardDetails" component={DetailsScreen} />
      <Stack.Screen name="JobCardStages" component={StagesScreen} />
      <Stack.Screen name="JobCardReview" component={ReviewScreen} />
      <Stack.Screen name="JobCardGenerated" component={GeneratedScreen} />
      <Stack.Screen
        name="JobCardSentToStore"
        component={SentToStoreScreen}
        options={{ gestureEnabled: false }}
      />

      <Stack.Screen name="RequestedDetail" component={RequestedDetailScreen} />
      <Stack.Screen name="CollectDetail" component={CollectDetailScreen} />

      <Stack.Screen name="SelectMachine" component={SelectMachineScreen} />
      <Stack.Screen name="MachineDetail" component={MachineDetailScreen} />

      <Stack.Screen name="ProductionDetail" component={ProductionDetailScreen} />
      <Stack.Screen name="StageForm" component={StageFormScreen} />
    </Stack.Navigator>
  );
}
