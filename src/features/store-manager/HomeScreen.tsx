import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TabRow, TopBar, type TabDef } from '../../components';
import { colors, spacing } from '../../theme';
import { useQuery } from '../../data/useQuery';
import { useSession } from '../../state/session';
import type { StoreManagerStackParamList } from '../../navigation/StoreManagerStack';
import { isOpenPo, listJobs, listPurchaseOrders, listSales } from './api';
import { AuditTab } from './audit/AuditTab';
import { StockInTab, type StockInSub } from './stock-in/StockInTab';
import { StockOutTab, type StockOutSub } from './stock-out/StockOutTab';
import { StockTab } from './stock/StockTab';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'Home'>;

type StoreTab = 'stock' | 'stockIn' | 'stockOut' | 'audit';

/**
 * The module root: Stock / Stock In / Stock Out / Audit.
 *
 * The two badged tabs count what is waiting on this role: POs not yet
 * confirmed, and jobs waiting to be issued plus sales not yet paid. Their data
 * is fetched here, once, and handed to the tab that lists it.
 */
export function StoreManagerHomeScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id) as string;
  const [tab, setTab] = useState<StoreTab>('stock');
  const [stockInSub, setStockInSub] = useState<StockInSub>('po');
  const [stockOutSub, setStockOutSub] = useState<StockOutSub>('sales');

  const fetchPos = useCallback(() => listPurchaseOrders(factoryId), [factoryId]);
  const fetchOut = useCallback(
    () => Promise.all([listSales(factoryId), listJobs(factoryId)]),
    [factoryId],
  );
  const pos = useQuery(fetchPos, Boolean(factoryId));
  const out = useQuery(fetchOut, Boolean(factoryId));

  const sales = out.data?.[0] ?? null;
  const jobs = out.data?.[1] ?? null;
  const openPos = (pos.data ?? []).filter(isOpenPo).length;
  const openOut = (jobs?.pending.length ?? 0) + (sales ?? []).filter((s) => !s.paid).length;

  const tabs: TabDef<StoreTab>[] = [
    { key: 'stock', label: 'Stock' },
    { key: 'stockIn', label: 'Stock In', count: openPos || undefined },
    { key: 'stockOut', label: 'Stock Out', count: openOut || undefined },
    { key: 'audit', label: 'Audit' },
  ];

  return (
    <View style={styles.screen}>
      <TopBar variant="home" onPressNotifications={() => {}} />
      <TabRow tabs={tabs} activeKey={tab} onChange={setTab} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'stock' ? (
          <StockTab
            factoryId={factoryId}
            onOpenItem={(stockItemId) => navigation.navigate('StockItem', { stockItemId })}
          />
        ) : null}

        {tab === 'stockIn' ? (
          <StockInTab
            factoryId={factoryId}
            sub={stockInSub}
            onSub={setStockInSub}
            pos={pos.data}
            posLoading={pos.loading}
            onOpenPo={(purchaseOrderId) => navigation.navigate('PODetail', { purchaseOrderId })}
            onNewPo={() => navigation.navigate('NewPurchaseOrder')}
            onNewExchange={() => navigation.navigate('NewExchange')}
            onNewReturn={() => navigation.navigate('NewReturn')}
          />
        ) : null}

        {tab === 'stockOut' ? (
          <StockOutTab
            sub={stockOutSub}
            onSub={setStockOutSub}
            sales={sales}
            jobs={jobs}
            loading={out.loading}
            onNewSale={() => navigation.navigate('NewSale')}
            onOpenSale={(saleId) => navigation.navigate('SaleDetail', { saleId })}
            onOpenJob={(orderId) => navigation.navigate('Job', { orderId })}
          />
        ) : null}

        {tab === 'audit' ? (
          <AuditTab factoryId={factoryId} onStart={() => navigation.navigate('AuditSheet')} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.content * 2 },
});
