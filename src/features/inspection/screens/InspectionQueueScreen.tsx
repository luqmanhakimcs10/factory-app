import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { EmptyState, OrderCard, TopBar } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { InspectionStackParamList } from '../../../navigation/InspectionStack';
import { findFirstPendingUnit, getInspectionQueue, type QueueOrder } from '../api';
import { useInspectionSession } from '../store';

type Props = NativeStackScreenProps<InspectionStackParamList, 'InspectionQueue'>;

export function InspectionQueueScreen({ navigation }: Props) {
  const profile = useSession((state) => state.profile);
  const clearLastAction = useInspectionSession((state) => state.clearLastAction);
  const [opening, setOpening] = useState<string | null>(null);

  const factoryId = profile?.factory_id;

  const fetcher = useCallback(() => getInspectionQueue(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  // The queue is the module root, so landing here means the QA person left the
  // review loop — the "what you just did" banner should not survive that.
  useFocusEffect(
    useCallback(() => {
      clearLastAction();
    }, [clearLastAction]),
  );

  const openOrder = async (orderId: string) => {
    setOpening(orderId);
    try {
      // Re-checked against the database rather than trusting the list: another
      // QA person may have finished the order since this screen loaded.
      const unit = await findFirstPendingUnit(orderId);
      if (unit) {
        navigation.navigate('Inspect', { orderId, unitId: unit.id });
      } else {
        navigation.navigate('Complete', { orderId });
      }
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar variant="home" onPressNotifications={() => {}} />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Could not load the queue" hint={error.message} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {!data || data.pending.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="Nothing waiting"
              hint="New orders appear here as soon as the order taker submits them."
            />
          ) : (
            data.pending.map((order) => (
              <OrderCard
                key={order.id}
                code={order.code}
                status="progress"
                clientName={order.clientName}
                meta={`${order.done} of ${order.total} inspected`}
                swatches={order.swatches}
                variant={opening === order.id ? 'disabled' : 'default'}
                onPress={() => void openOrder(order.id)}
              />
            ))
          )}

          <Text style={[type.heading, styles.sectionTitle]}>Inspected Today</Text>

          {!data || data.inspectedToday.length === 0 ? (
            <EmptyState
              icon="sunrise"
              title="Nothing finished today yet"
              hint="Orders you clear today are listed here."
            />
          ) : (
            data.inspectedToday.map((order) => <DoneRow key={order.id} order={order} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

function DoneRow({ order }: { order: QueueOrder }) {
  const hasReturns = order.returned > 0;

  return (
    <View style={styles.doneRow}>
      <View style={styles.doneCheck}>
        <Feather name="check" size={14} color={colors.success} />
      </View>
      <Text style={[type.code, styles.doneCode]}>{order.code}</Text>
      <Text style={[type.label, hasReturns ? styles.doneReturned : styles.donePassed]}>
        {hasReturns
          ? `${order.returned} ${order.returned === 1 ? 'item' : 'items'} returned`
          : 'All passed'}
      </Text>
    </View>
  );
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
  sectionTitle: {
    marginTop: spacing.tight,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingHorizontal: spacing.content - 2,
    paddingVertical: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  doneCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneCode: {
    flex: 1,
    color: colors.textPrimary,
  },
  donePassed: {
    color: colors.success,
  },
  doneReturned: {
    color: colors.danger,
  },
});
