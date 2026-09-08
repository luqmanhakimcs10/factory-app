import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  EmptyState,
  OrderCard,
  TabRow,
  TopBar,
  type PillStatus,
  type TabDef,
} from '../../../components';
import { colors, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { listFloorOrders, orderMatchesTab, type FmOrder, type HomeTab } from '../api';
import { useHomeTab } from '../homeTabStore';
import { useJobCard } from '../job-card/jobCardStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'Home'>;

const TAB_LABELS: Record<HomeTab, string> = {
  all: 'All',
  jobcards: 'Job Cards',
  inventory: 'Inventory Request',
  machines: 'Assign Machines',
  production: 'Production',
  ready: 'Ready',
};

const TAB_ORDER: HomeTab[] = [
  'all',
  'jobcards',
  'inventory',
  'machines',
  'production',
  'ready',
];

/** Pill label and tone per floor status — one lookup, used by every tab. */
const STATUS_LABELS: Record<string, { label: string; pill: PillStatus }> = {
  materialRequested: { label: 'Materials Requested', pill: 'progress' },
  readyToCollect: { label: 'Ready to Collect', pill: 'progress' },
  machineAssigning: { label: 'Assigning Machine', pill: 'progress' },
  productionAwaiting: { label: 'Awaiting Production', pill: 'progress' },
  inProduction: { label: 'In Production', pill: 'progress' },
  queued: { label: 'Queued', pill: 'draft' },
};

function pillFor(order: FmOrder): { status: PillStatus; label: string } {
  if (order.floor_status) {
    const entry = STATUS_LABELS[order.floor_status];
    if (entry) return { status: entry.pill, label: entry.label };
  }
  if (order.stage === 'jobcard') return { status: 'completed', label: 'Ready for Job Card' };
  return { status: 'progress', label: 'In Progress' };
}

const EMPTY_HINTS: Record<HomeTab, string> = {
  all: 'Orders appear here once the order taker submits them.',
  jobcards: 'Orders that clear inspection land here, waiting for a job card.',
  inventory: 'Requested and ready-to-collect materials show up here.',
  machines: 'Orders waiting for a machine appear here.',
  production: 'Orders running on a machine appear here.',
  ready: 'Orders whose sheets have all cleared final inspection appear here.',
};

export function HomeScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const activeTab = useHomeTab((state) => state.activeTab);
  const setActiveTab = useHomeTab((state) => state.setActiveTab);
  const beginJobCard = useJobCard((state) => state.begin);

  const fetcher = useCallback(() => listFloorOrders(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const orders = data ?? [];

  const tabs: TabDef<HomeTab>[] = TAB_ORDER.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: orders.filter((order) => orderMatchesTab(order, key)).length,
  }));

  const visible = orders.filter((order) => orderMatchesTab(order, activeTab));

  const openOrder = (order: FmOrder) => {
    switch (activeTab) {
      case 'jobcards':
        // Entry point of the job-card flow — the draft is wiped here so the
        // previous order's needle layout cannot bleed through.
        beginJobCard(order.id);
        navigation.navigate('JobCardDesignSheet', { orderId: order.id });
        break;
      case 'inventory':
        navigation.navigate(
          order.floor_status === 'readyToCollect' ? 'CollectDetail' : 'RequestedDetail',
          { orderId: order.id },
        );
        break;
      case 'machines':
        navigation.navigate('SelectMachine', { orderId: order.id });
        break;
      case 'production':
      case 'ready':
        navigation.navigate('ProductionDetail', { orderId: order.id });
        break;
      case 'all':
        // Read-only tab.
        break;
    }
  };

  const renderCard = (order: FmOrder) => {
    const pill = pillFor(order);
    // All is a read-only overview of every live order, so its rows carry the
    // muted treatment: without it they look identical to the actionable rows
    // on every other tab and a tap that does nothing reads as a broken screen.
    const readOnly = activeTab === 'all';
    return (
      <OrderCard
        key={order.id}
        code={order.code}
        status={pill.status}
        clientName={order.clients?.name ?? 'Unknown client'}
        meta={order.design_code ? `Design ${order.design_code}` : pill.label}
        swatches={order.order_sheets.map((sheet) => ({
          colorId: sheet.color_id,
          customHex: sheet.custom_hex,
        }))}
        variant={readOnly ? 'disabled' : 'default'}
        onPress={readOnly ? undefined : () => openOrder(order)}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Active Orders" onPressBack={navigation.goBack} />
      <TabRow tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Could not load orders" hint={error.message} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {activeTab === 'inventory' ? (
            // The inventory tab is two queues in one: what the store still owes
            // us, and what is waiting to be picked up.
            <>
              <Text style={type.heading}>Requested</Text>
              {renderSection(
                visible.filter((order) => order.floor_status === 'materialRequested'),
                renderCard,
                'Nothing requested',
              )}
              <Text style={[type.heading, styles.sectionGap]}>Ready to Collect</Text>
              {renderSection(
                visible.filter((order) => order.floor_status === 'readyToCollect'),
                renderCard,
                'Nothing ready to collect',
              )}
            </>
          ) : visible.length === 0 ? (
            <EmptyState
              icon="inbox"
              title={`Nothing in ${TAB_LABELS[activeTab]}`}
              hint={EMPTY_HINTS[activeTab]}
            />
          ) : (
            <>
              {activeTab === 'all' ? (
                <Text style={type.caption}>
                  Overview only — open an order from the tab that owns its next step.
                </Text>
              ) : null}
              {visible.map(renderCard)}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function renderSection(
  orders: FmOrder[],
  render: (order: FmOrder) => React.ReactNode,
  emptyTitle: string,
) {
  if (orders.length === 0) return <EmptyState icon="inbox" title={emptyTitle} />;
  return <>{orders.map(render)}</>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loader: {
    marginTop: spacing.content * 3,
  },
  content: {
    padding: spacing.content,
    gap: spacing.block,
  },
  sectionGap: {
    marginTop: spacing.tight,
  },
});
