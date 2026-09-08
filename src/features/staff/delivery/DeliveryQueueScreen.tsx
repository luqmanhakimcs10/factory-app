import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { EmptyState, StatusPill, TopBar } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StaffStackParamList } from '../../../navigation/StaffStack';
import { isReadyToDeliver, listDeliveryOrders, type DeliveryOrder } from '../api';

type Props = NativeStackScreenProps<StaffStackParamList, 'DeliveryQueue'>;

/**
 * What is finished and waiting to go out, and what already went.
 *
 * "Ready to deliver" means every sheet on the order reached `ready` — the last
 * finishing stage signed off — and nothing has been delivered yet. An order
 * part-finished is not a half-delivery; it simply is not on this list.
 */
export function DeliveryQueueScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(() => listDeliveryOrders(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const orders = data ?? [];
  const ready = orders.filter(isReadyToDeliver);
  const delivered = orders.filter((order) => order.delivered_at !== null);

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Order Delivery" onPressBack={navigation.goBack} />

      <ScrollView contentContainerStyle={styles.content}>
        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : error ? (
          <EmptyState icon="alert-triangle" title="Could not load deliveries" hint={error.message} />
        ) : (
          <>
            <Text style={type.heading}>Ready to Deliver</Text>
            {ready.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title="Nothing to deliver"
                hint="An order lands here once every sheet on it has cleared finishing."
              />
            ) : (
              ready.map((order) => (
                <DeliveryRow
                  key={order.id}
                  order={order}
                  onPress={() => navigation.navigate('Deliver', { orderId: order.id })}
                />
              ))
            )}

            {delivered.length > 0 ? (
              <>
                <Text style={[type.heading, styles.sectionGap]}>Delivered</Text>
                {delivered.map((order) => (
                  <DeliveryRow
                    key={order.id}
                    order={order}
                    onPress={() => navigation.navigate('Deliver', { orderId: order.id })}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * One order on the round.
 *
 * The third line is the address while there is still a journey to make, and the
 * delivery date once there is not — the same slot, answering whichever question
 * is still open.
 */
function DeliveryRow({ order, onPress }: { order: DeliveryOrder; onPress: () => void }) {
  const done = order.delivered_at !== null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text style={type.code} numberOfLines={1}>
            {order.code}
          </Text>
          <StatusPill
            status={done ? 'passed' : 'progress'}
            label={done ? 'Delivered' : 'Ready'}
          />
        </View>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {order.clients?.name ?? 'Unknown client'}
        </Text>
        <Text style={type.label} numberOfLines={1}>
          {done
            ? `Delivered ${new Date(order.delivered_at as string).toLocaleDateString()}`
            : (order.clients?.address ?? 'No address on file')}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.content,
    gap: spacing.block,
  },
  loader: {
    marginTop: spacing.content * 2,
  },
  sectionGap: {
    marginTop: spacing.tight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    padding: spacing.content - 2,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
  },
});
