import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  EmptyState,
  MiniNeedleRow,
  StaticField,
  TopBar,
} from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { completeMachineJob, getMachine } from '../api';
import { useHomeTab } from '../homeTabStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'MachineDetail'>;

export function MachineDetailScreen({ navigation, route }: Props) {
  const { machineId, fromAssignmentOrderId } = route.params;
  const insets = useSafeAreaInsets();
  const setActiveTab = useHomeTab((state) => state.setActiveTab);

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => getMachine(machineId), [machineId]);
  const { data: machine, loading } = useQuery(fetcher);

  const complete = async () => {
    if (!machine) return;

    setWorking(true);
    setError(null);
    try {
      // The job that was running becomes `last_job` — the threading reference
      // for whoever loads this machine next.
      await completeMachineJob(machine);

      if (fromAssignmentOrderId) {
        navigation.goBack();
      } else {
        setActiveTab('machines');
        navigation.navigate('Home');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  const job = machine?.current_job;

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={machine?.label ?? 'Machine'}
        trailing={machine?.status === 'running' ? 'Running' : 'Idle'}
        onPressBack={navigation.goBack}
      />

      {loading && !machine ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !machine ? (
        <EmptyState icon="alert-triangle" title="Could not load this machine" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {job ? (
              <>
                <Card>
                  <StaticField icon="hash" label="Order" value={job.code} />
                  <StaticField
                    icon="grid"
                    label="Design Code"
                    value={job.design_code ?? '—'}
                  />
                  <StaticField icon="user" label="Client" value={job.client} />
                </Card>

                <Card title="Needle layout">
                  {job.needles.length === 0 ? (
                    <EmptyState icon="inbox" title="No needle layout recorded" />
                  ) : (
                    job.needles.map((entry) => (
                      <MiniNeedleRow
                        key={entry.color_id}
                        colorId={entry.color_id}
                        needle={entry.needle}
                        stitches={entry.stitches}
                      />
                    ))
                  )}
                </Card>
              </>
            ) : (
              <EmptyState
                icon="cpu"
                title="This machine is idle"
                hint="Assign an order to it from the Assign Machines queue."
              />
            )}

            {error ? (
              <Card tone="danger">
                <Text style={[type.bodyStrong, styles.errorTitle]}>
                  Could not complete the job
                </Text>
                <Text style={type.body}>{error}</Text>
              </Card>
            ) : null}
          </ScrollView>

          {job ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, spacing.content) },
              ]}
            >
              <Button
                label="Mark Job Complete"
                flex
                loading={working}
                onPress={complete}
              />
            </View>
          ) : null}
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
