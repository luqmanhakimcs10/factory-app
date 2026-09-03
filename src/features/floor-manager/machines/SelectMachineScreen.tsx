import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Button,
  Card,
  EmptyState,
  MiniNeedleRow,
  StaticField,
  TopBar,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { assignMachine, getFloorOrder, listMachines } from '../api';
import { useHomeTab } from '../homeTabStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'SelectMachine'>;

export function SelectMachineScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const factoryId = useSession((state) => state.profile?.factory_id);
  const setActiveTab = useHomeTab((state) => state.setActiveTab);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    const [order, machines] = await Promise.all([
      getFloorOrder(orderId),
      listMachines(factoryId as string),
    ]);
    return { order, machines };
  }, [orderId, factoryId]);

  const { data, loading } = useQuery(fetcher, Boolean(factoryId));

  const order = data?.order;
  const selected = data?.machines.find((machine) => machine.id === selectedId);

  const assign = async () => {
    if (!order || !selected) return;

    setWorking(true);
    setError(null);
    try {
      await assignMachine({
        machineId: selected.id,
        orderId,
        job: {
          order_id: order.id,
          code: order.code,
          client: order.clients?.name ?? 'Unknown client',
          design_code: order.design_code,
          needles: order.needles ?? [],
        },
      });
      setActiveTab('machines');
      navigation.navigate('Home');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title="Assign Machine"
        trailing={order?.code}
        onPressBack={navigation.goBack}
      />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !order ? (
        <EmptyState icon="alert-triangle" title="Could not load this order" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <StaticField icon="hash" label="Design Code" value={order.design_code ?? '—'} />
              <StaticField
                icon="clipboard"
                label="Job Card"
                value={order.job_card_code ?? '—'}
              />
              <StaticField icon="user" label="Client" value={order.clients?.name ?? '—'} />
            </Card>

            <Card title="Machines">
              {(data?.machines ?? []).length === 0 ? (
                <EmptyState
                  icon="cpu"
                  title="No machines registered"
                  hint="Add machines for this factory before assigning work."
                />
              ) : (
                (data?.machines ?? []).map((machine) => {
                  const running = machine.status === 'running';
                  const isSelected = machine.id === selectedId;

                  return (
                    <Pressable
                      key={machine.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() =>
                        running
                          ? // A running machine is not a choice — it is a thing
                            // to go and look at.
                            navigation.navigate('MachineDetail', {
                              machineId: machine.id,
                              fromAssignmentOrderId: orderId,
                            })
                          : setSelectedId(machine.id)
                      }
                      style={[
                        styles.machine,
                        isSelected && styles.machineSelected,
                        running && styles.machineRunning,
                      ]}
                    >
                      <View style={styles.machineIcon}>
                        <Feather
                          name="cpu"
                          size={18}
                          color={running ? colors.warning : colors.primary}
                        />
                      </View>
                      <View style={styles.machineText}>
                        <Text style={type.bodyStrong}>{machine.label}</Text>
                        <Text style={type.caption}>
                          {running
                            ? `Running ${machine.current_job?.code ?? 'a job'}`
                            : 'Idle'}
                        </Text>
                      </View>
                      <Feather
                        name={running ? 'chevron-right' : isSelected ? 'check-circle' : 'circle'}
                        size={18}
                        color={isSelected ? colors.primary : colors.textMuted}
                      />
                    </Pressable>
                  );
                })
              )}
            </Card>

            {selected?.last_job ? (
              // What this machine ran last, as a threading reference.
              <Card title={`Last job on ${selected.label}`}>
                <StaticField
                  icon="hash"
                  label="Order"
                  value={selected.last_job.code}
                />
                {selected.last_job.needles.map((entry) => (
                  <MiniNeedleRow
                    key={entry.color_id}
                    colorId={entry.color_id}
                    needle={entry.needle}
                    stitches={entry.stitches}
                  />
                ))}
              </Card>
            ) : null}

            {error ? (
              <Card tone="danger">
                <Text style={[type.bodyStrong, styles.errorTitle]}>
                  Could not assign the machine
                </Text>
                <Text style={type.body}>{error}</Text>
              </Card>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, spacing.content) },
            ]}
          >
            <Button
              label="Assign"
              flex
              disabled={!selected}
              loading={working}
              onPress={assign}
            />
          </View>
        </>
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
  machine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    padding: spacing.tight + 2,
    borderRadius: radius.tile,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  machineSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.neutralAccent,
  },
  machineRunning: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  machineIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  machineText: {
    flex: 1,
  },
  errorTitle: {
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
