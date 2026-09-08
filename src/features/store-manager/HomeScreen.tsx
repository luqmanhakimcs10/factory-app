import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TabRow, TopBar, type TabDef } from '../../components';
import { colors, spacing } from '../../theme';
import { useQuery } from '../../data/useQuery';
import { useSession } from '../../state/session';
import type { StoreManagerStackParamList } from '../../navigation/StoreManagerStack';
import { isOpenPo, listPurchaseOrders } from './api';
import { AuditScreen } from './audit/AuditScreen';
import { IssueScreen } from './issue/IssueScreen';
import { POsScreen } from './purchase-orders/POsScreen';
import { StockScreen } from './stock/StockScreen';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'Home'>;

type StoreTab = 'stock' | 'pos' | 'issue' | 'audit';

/**
 * The module root: a four-tab segmented control over four independent lists.
 *
 * The tabs share one stack rather than nesting a navigator each — every
 * drill-down from here is a route on the same stack, which keeps back
 * behaviour predictable and leaves room for the detail screens that do not
 * exist yet.
 */
export function StoreManagerHomeScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const [tab, setTab] = useState<StoreTab>('stock');

  // Only the PO tab carries a badge, so its count is fetched here rather than
  // inside the tab that may not be mounted.
  //
  // The fetcher has to be memoized: `useQuery` keys its focus effect on the
  // function's identity, so an inline arrow re-fires the fetch on every render
  // it causes — a refetch loop for as long as this screen is focused.
  const listPos = useCallback(
    () => listPurchaseOrders(factoryId as string),
    [factoryId],
  );
  const poFetcher = useQuery(listPos, Boolean(factoryId));
  const openPoCount = (poFetcher.data ?? []).filter(isOpenPo).length;

  const tabs: TabDef<StoreTab>[] = [
    { key: 'stock', label: 'Stock' },
    { key: 'pos', label: "PO's", count: openPoCount },
    { key: 'issue', label: 'Issue' },
    { key: 'audit', label: 'Audit' },
  ];

  return (
    <View style={styles.screen}>
      <TopBar variant="home" onPressNotifications={() => {}} />

      <TabRow tabs={tabs} activeKey={tab} onChange={setTab} />

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'stock' ? (
          <StockScreen
            onOpenItem={(stockItemId) =>
              navigation.navigate('ComingSoon', {
                title: 'Stock detail',
                note: 'No screenshot exists for adjusting a stock item, so no form was invented for it.',
              })
            }
          />
        ) : null}

        {tab === 'pos' ? (
          <POsScreen
            onNewPurchaseOrder={() =>
              navigation.navigate('ComingSoon', {
                title: 'New Purchase Order',
                note: 'The creation form has not been specified yet.',
              })
            }
            onOpenPo={() =>
              navigation.navigate('ComingSoon', {
                title: 'PO detail',
                note: 'The purchase-order detail view has not been specified yet.',
              })
            }
            onOpenSubmittedPo={(purchaseOrderId) =>
              navigation.navigate('PODetail', { purchaseOrderId })
            }
          />
        ) : null}

        {tab === 'issue' ? (
          <IssueScreen
            onOpenOrder={(orderId) => navigation.navigate('IssueDetail', { orderId })}
          />
        ) : null}

        {tab === 'audit' ? (
          <AuditScreen
            onStartNewAudit={() =>
              navigation.navigate('ComingSoon', {
                title: 'New audit',
                note: 'The audit-taking flow — walking every stock item and comparing system against physical count — has not been specified.',
              })
            }
            onOpenVariance={() =>
              navigation.navigate('ComingSoon', {
                title: 'Variance detail',
                note: 'The audit_line_items table exists, but the screen that reads it has not been specified.',
              })
            }
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: spacing.content * 2,
  },
});
