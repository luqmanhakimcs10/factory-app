import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import {
  DateFilterChips,
  EmptyState,
  POCard,
  dayKey,
  type DateFilterValue,
} from '../../../components';
import { colors, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import { listPurchaseOrders, poSwatches, type PurchaseOrder } from '../api';

export interface POsScreenProps {
  onNewPurchaseOrder: () => void;
  /** The two undesigned statuses — still the stub. */
  onOpenPo: (purchaseOrderId: string) => void;
  /** A priced bill, which has a real detail screen. */
  onOpenSubmittedPo: (purchaseOrderId: string) => void;
}

export function POsScreen({
  onNewPurchaseOrder,
  onOpenPo,
  onOpenSubmittedPo,
}: POsScreenProps) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(null);

  const fetcher = useCallback(() => listPurchaseOrders(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const orders = data ?? [];
  const dates = [...new Set(orders.map((po) => dayKey(po.date)))];
  const visible = dateFilter
    ? orders.filter((po) => dayKey(po.date) === dateFilter)
    : orders;

  const requested = visible.filter((po) => po.status === 'awaitingProcurement');
  // Procurement has priced these and attached a bill. This is the only section
  // whose cards open a real screen — see `PODetailScreen`.
  const submitted = visible.filter((po) => po.status === 'submitted');
  const awaiting = visible.filter((po) => po.status === 'awaitingConfirmation');

  return (
    <View style={styles.container}>
      <View style={styles.newWrap}>
        <Pressable
          accessibilityRole="button"
          onPress={onNewPurchaseOrder}
          style={styles.newButton}
        >
          <Feather name="plus" size={18} color={colors.primary} />
          <Text style={[type.bodyStrong, styles.newLabel]}>New Purchase Order</Text>
        </Pressable>
      </View>

      <DateFilterChips dates={dates} value={dateFilter} onChange={setDateFilter} />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load purchase orders"
          hint={error.message}
        />
      ) : (
        <View style={styles.body}>
          <Text style={type.heading}>Requested — Awaiting Procurement</Text>
          {requested.length === 0 ? (
            <EmptyState icon="inbox" title="Nothing awaiting procurement" />
          ) : (
            requested.map((po) => renderCard(po, onOpenPo))
          )}

          <Text style={[type.heading, styles.sectionGap]}>
            Submitted — Needs Your Confirmation
          </Text>
          {submitted.length === 0 ? (
            <EmptyState icon="inbox" title="No bills waiting on you" />
          ) : (
            submitted.map((po) => renderCard(po, onOpenSubmittedPo))
          )}

          <Text style={[type.heading, styles.sectionGap]}>Awaiting Confirmation</Text>
          {awaiting.length === 0 ? (
            <EmptyState icon="inbox" title="Nothing awaiting confirmation" />
          ) : (
            awaiting.map((po) => renderCard(po, onOpenPo))
          )}
        </View>
      )}
    </View>
  );
}

function renderCard(po: PurchaseOrder, onOpenPo: (id: string) => void) {
  const manual = po.source === 'manual';
  return (
    <POCard
      key={po.id}
      poNumber={po.po_number}
      // A manual PO has no supplier yet, so the card carries its status
      // instead of a name.
      title={po.actual_supplier?.name ?? po.supplier_name ?? 'Awaiting Procurement'}
      tag={manual ? 'MANUAL' : 'SYSTEM-GENERATED'}
      date={new Date(po.date).toLocaleDateString()}
      swatches={poSwatches(po)}
      onPress={() => onOpenPo(po.id)}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  newWrap: {
    paddingHorizontal: spacing.content,
    paddingTop: spacing.content,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight,
    paddingVertical: spacing.content - 2,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  newLabel: {
    color: colors.primary,
  },
  loader: {
    marginTop: spacing.content * 3,
  },
  body: {
    padding: spacing.content,
    gap: spacing.block,
  },
  sectionGap: {
    marginTop: spacing.tight,
  },
});
