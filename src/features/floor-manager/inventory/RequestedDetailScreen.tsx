import { useCallback, useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card, EmptyState, MaterialRow, NoteCard, StaticField, TopBar } from '../../../components';
import { colors, spacing } from '../../../theme';
import { getSwatch } from '../../../data/swatches';
import { supabase } from '../../../data/supabase';
import { useQuery } from '../../../data/useQuery';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { getFloorOrder } from '../api';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'RequestedDetail'>;

/**
 * Read-only view of a materials request.
 *
 * There is nothing to press here: `materialRequested -> readyToCollect` is the
 * Store Manager's transition, and that role has no screens yet. The realtime
 * subscription below is this module's only way of noticing it happen, so the
 * screen flips to the collect flow without the floor manager pulling to refresh.
 */
export function RequestedDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params;

  const fetcher = useCallback(() => getFloorOrder(orderId), [orderId]);
  const { data: order, loading, refetch } = useQuery(fetcher);

  useEffect(() => {
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => refetch(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, refetch]);

  // The store issued the items while this screen was open.
  useEffect(() => {
    if (order?.floor_status === 'readyToCollect') {
      navigation.replace('CollectDetail', { orderId });
    }
  }, [navigation, order?.floor_status, orderId]);

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={order?.design_code ?? 'Materials Requested'}
        trailing={order?.code}
        onPressBack={navigation.goBack}
      />

      {loading && !order ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !order ? (
        <EmptyState icon="alert-triangle" title="Could not load this request" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <NoteCard text="Waiting for the Store Manager to issue these items." />

          <Card>
            <StaticField icon="hash" label="Design Code" value={order.design_code ?? '—'} />
            <StaticField
              icon="clipboard"
              label="Job Card"
              value={order.job_card_code ?? '—'}
            />
            <StaticField icon="user" label="Client" value={order.clients?.name ?? '—'} />
          </Card>

          <Card title="Requested materials">
            {(order.materials ?? []).length === 0 ? (
              <EmptyState icon="inbox" title="No materials on this request" />
            ) : (
              (order.materials ?? []).map((entry) => (
                <MaterialRow
                  key={entry.color_id}
                  colorId={entry.color_id}
                  label={getSwatch(entry.color_id)?.label ?? entry.color_id}
                  quantity={`${entry.qty_grams} g`}
                />
              ))
            )}
          </Card>
        </ScrollView>
      )}
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
});
