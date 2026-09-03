import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { EmptyState, OrderCard, TopBar, type PillStatus } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { listOrders, orderMetaText, type OrderFilter } from '../api';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'OrdersList'>;

const FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

const EMPTY_COPY: Record<OrderFilter, { title: string; hint: string }> = {
  all: { title: 'No orders yet', hint: 'Tap + to take your first order.' },
  draft: { title: 'No drafts', hint: 'Unfinished orders show up here.' },
  in_progress: { title: 'Nothing in progress', hint: 'Submitted orders appear here while QA works through them.' },
  completed: { title: 'Nothing completed yet', hint: 'Orders land here once they clear delivery.' },
};

/** Order-taker home: the queue of this factory's orders. */
export function OrdersListScreen({ navigation }: Props) {
  const profile = useSession((state) => state.profile);
  const resetWizard = useWizard((state) => state.reset);
  const [filter, setFilter] = useState<OrderFilter>('all');

  const factoryId = profile?.factory_id;
  const profileId = profile?.id;

  const fetcher = useCallback(
    () => listOrders(factoryId as string, profileId as string, filter),
    [factoryId, profileId, filter],
  );
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId && profileId));

  const startNewOrder = () => {
    // The FAB is one of the three reset points: a new order never inherits
    // anything from an abandoned one.
    resetWizard();
    navigation.navigate('PickClient');
  };

  return (
    <View style={styles.screen}>
      <TopBar variant="home" onPressNotifications={() => {}} />

      <View style={styles.tabs}>
        {FILTERS.map((entry) => {
          const active = entry.key === filter;
          return (
            <Pressable
              key={entry.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(entry.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[type.pill, active ? styles.tabLabelActive : styles.tabLabel]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.content}>
          {!factoryId ? (
            <EmptyState
              icon="user-x"
              title="Not signed in"
              hint="Sign in to load your factory's orders."
            />
          ) : loading && !data ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          ) : error ? (
            <EmptyState icon="alert-triangle" title="Could not load orders" hint={error.message} />
          ) : !data || data.length === 0 ? (
            <EmptyState icon="inbox" {...EMPTY_COPY[filter]} />
          ) : (
            data.map((row) => (
              <OrderCard
                key={row.id}
                code={row.code}
                status={statusToPill(row.status)}
                clientName={row.clients?.name ?? 'Unknown client'}
                meta={orderMetaText(row)}
                swatches={row.order_sheets.map((sheet) => ({
                  colorId: sheet.color_id,
                  customHex: sheet.custom_hex,
                }))}
                onPress={() => navigation.navigate('OrderDetail', { orderId: row.id })}
              />
            ))
          )}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New order"
          onPress={startNewOrder}
          style={styles.fab}
        >
          <Feather name="plus" size={26} color={colors.surface} />
        </Pressable>
      </View>
    </View>
  );
}

function statusToPill(status: 'draft' | 'in_progress' | 'completed'): PillStatus {
  return status === 'in_progress' ? 'progress' : status;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.tight - 2,
    paddingHorizontal: spacing.content,
    paddingVertical: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.border,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabLabel: {
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.surface,
  },
  body: {
    flex: 1,
  },
  content: {
    padding: spacing.content,
    gap: spacing.block,
    // Room for the FAB, which floats over the top-right of the first card.
    paddingTop: spacing.content + 56 + spacing.tight,
    paddingBottom: spacing.content * 2,
  },
  loader: {
    marginTop: spacing.content * 3,
  },
  fab: {
    position: 'absolute',
    top: spacing.content,
    right: spacing.content,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
