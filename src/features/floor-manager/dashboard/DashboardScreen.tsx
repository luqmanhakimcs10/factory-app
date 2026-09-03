import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DashCard, EmptyState, TopBar } from '../../../components';
import { colors, spacing } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { listFloorOrders, listMachines } from '../api';
import { useHomeTab } from '../homeTabStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'Dashboard'>;

export function DashboardScreen({ navigation }: Props) {
  const profile = useSession((state) => state.profile);
  const setActiveTab = useHomeTab((state) => state.setActiveTab);

  const factoryId = profile?.factory_id;

  const fetcher = useCallback(async () => {
    const [orders, machines] = await Promise.all([
      listFloorOrders(factoryId as string),
      listMachines(factoryId as string),
    ]);
    return { orders, machines };
  }, [factoryId]);

  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const running = data?.machines.filter((machine) => machine.status === 'running').length ?? 0;
  const totalMachines = data?.machines.length ?? 0;

  const openAllOrders = () => {
    setActiveTab('all');
    navigation.navigate('Home');
  };

  return (
    <View style={styles.screen}>
      <TopBar variant="home" onPressNotifications={() => {}} />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load the dashboard"
          hint={error.message}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            <DashCard
              icon="layers"
              count={data?.orders.length ?? 0}
              title="Active Orders"
              subLabel="Everything on the floor right now"
              onPress={openAllOrders}
            />
            <DashCard
              icon="check-circle"
              count="—"
              title="Completed Orders"
              subLabel="Coming soon"
              tone="success"
              onPress={() =>
                navigation.navigate('ComingSoon', { title: 'Completed Orders' })
              }
            />
            <DashCard
              icon="cpu"
              count={`${running}/${totalMachines}`}
              title="Shifts"
              subLabel={`${running} of ${totalMachines} machines running`}
              tone="warning"
              onPress={() => navigation.navigate('ComingSoon', { title: 'Shifts' })}
            />
            <DashCard
              icon="alert-octagon"
              count="—"
              title="Damages"
              subLabel="Coming soon"
              tone="danger"
              onPress={() => navigation.navigate('ComingSoon', { title: 'Damages' })}
            />
          </View>
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
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.block,
  },
});
