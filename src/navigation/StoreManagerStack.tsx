import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuditSheetScreen } from '../features/store-manager/audit/AuditSheetScreen';
import { StoreManagerHomeScreen } from '../features/store-manager/HomeScreen';
import { NewPurchaseOrderScreen } from '../features/store-manager/purchase-orders/NewPurchaseOrderScreen';
import { PODetailScreen } from '../features/store-manager/purchase-orders/PODetailScreen';
import { NewExchangeScreen } from '../features/store-manager/stock-in/NewExchangeScreen';
import { NewReturnScreen } from '../features/store-manager/stock-in/NewReturnScreen';
import { JobScreen } from '../features/store-manager/stock-out/JobScreen';
import { NewSaleScreen } from '../features/store-manager/stock-out/NewSaleScreen';
import { SaleDetailScreen } from '../features/store-manager/stock-out/SaleDetailScreen';
import { StockItemScreen } from '../features/store-manager/stock/StockItemScreen';

/**
 * Store Manager.
 *
 * The module root is Stock / Stock In / Stock Out / Audit; everything reachable
 * from it is a route on this one stack.
 *
 * Its place in the order lifecycle is one transition: issuing a Job turns
 * `floor_status = 'materialRequested'` into `'readyToCollect'` (via
 * `issue_job`, 0018), which is what the Floor Manager's Collect screen waits
 * on. Collecting is the floor manager's side and is not duplicated here.
 */
export type StoreManagerStackParamList = {
  Home: undefined;
  StockItem: { stockItemId: string };
  PODetail: { purchaseOrderId: string };
  NewPurchaseOrder: undefined;
  NewExchange: undefined;
  NewReturn: undefined;
  NewSale: undefined;
  SaleDetail: { saleId: string };
  Job: { orderId: string };
  AuditSheet: undefined;
};

const Stack = createNativeStackNavigator<StoreManagerStackParamList>();

export function StoreManagerTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={StoreManagerHomeScreen} />
      <Stack.Screen name="StockItem" component={StockItemScreen} />
      <Stack.Screen name="PODetail" component={PODetailScreen} />
      <Stack.Screen name="NewPurchaseOrder" component={NewPurchaseOrderScreen} />
      <Stack.Screen name="NewExchange" component={NewExchangeScreen} />
      <Stack.Screen name="NewReturn" component={NewReturnScreen} />
      <Stack.Screen name="NewSale" component={NewSaleScreen} />
      <Stack.Screen name="SaleDetail" component={SaleDetailScreen} />
      <Stack.Screen name="Job" component={JobScreen} />
      <Stack.Screen name="AuditSheet" component={AuditSheetScreen} />
    </Stack.Navigator>
  );
}
