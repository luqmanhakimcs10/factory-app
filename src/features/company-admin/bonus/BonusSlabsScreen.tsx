import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, EmptyState, TopBar } from '../../../components';
import { colors, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { RosterPill, SectionLabel } from '../components';
import { ILLUSTRATIVE_NOTE, workerOutput } from '../illustrative';
import {
  listBonusSlabs,
  listEmployees,
  qualifyingSlab,
  type BonusSlab,
} from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'BonusSlabs'>;

async function getBonusConfig(factoryId: string) {
  const [slabs, employees] = await Promise.all([
    listBonusSlabs(factoryId),
    listEmployees(factoryId),
  ]);

  return {
    slabs,
    // A bonus is paid on stitches, so only the people paid for stitches are
    // measured against a slab — the roster is filtered here rather than in the
    // query because the same `listEmployees` read backs the Employees screen.
    workers: employees.filter(
      (employee) => employee.status === 'active' && employee.role === 'machine_worker',
    ),
  };
}

/**
 * The daily-stitch thresholds, and who currently clears them.
 *
 * The snapshot below the slabs is the point of the screen: a threshold means
 * nothing until you can see how many people it would pay. Its stitch averages
 * are illustrative (see `illustrative.ts`) and come from the same function the
 * Reports Hub productivity tab uses, so the two screens cannot disagree about
 * one worker.
 */
export function BonusSlabsScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(() => getBonusConfig(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const openSlab = (slab?: BonusSlab) =>
    navigation.navigate('SlabForm', {
      id: slab?.id,
      threshold: slab?.threshold,
      bonusAmount: slab?.bonus_amount,
    });

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Bonus Slab Config" onPressBack={navigation.goBack} />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error || !data ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load the slabs"
          hint={error?.message}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <SectionLabel>Slabs — low to high</SectionLabel>

          {data.slabs.length === 0 ? (
            <EmptyState
              icon="layers"
              title="No slabs configured"
              hint="A slab pays a bonus once a worker's daily stitch average clears its threshold."
            />
          ) : (
            data.slabs.map((slab) => (
              <Pressable
                key={slab.id}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${formatRs(slab.bonus_amount)} bonus`}
                onPress={() => openSlab(slab)}
                style={({ pressed }) => [styles.slab, pressed && styles.pressed]}
              >
                <View style={styles.slabIcon}>
                  <Feather name="droplet" size={16} color={colors.primary} />
                </View>
                <View style={styles.slabText}>
                  <Text style={type.bodyStrong}>{`${formatRs(slab.bonus_amount)} bonus`}</Text>
                  <Text style={type.label}>
                    {`${slab.threshold.toLocaleString()}+ stitches/day`}
                  </Text>
                </View>
              </Pressable>
            ))
          )}

          <Button label="Add Slab" tone="outline" icon="plus" onPress={() => openSlab()} />

          <SectionLabel>Worker snapshot — this week&apos;s average</SectionLabel>

          {data.workers.length === 0 ? (
            <EmptyState
              icon="users"
              title="No machine workers yet"
              hint="Add an employee with the Machine Worker role to see who a slab would pay."
            />
          ) : (
            data.workers.map((worker) => {
              const { avgStitchesPerDay } = workerOutput(worker.id);
              const slab = qualifyingSlab(data.slabs, avgStitchesPerDay);

              return (
                <View key={worker.id} style={styles.worker}>
                  <View style={styles.workerHeader}>
                    <Text style={[type.bodyStrong, styles.workerName]} numberOfLines={1}>
                      {worker.name}
                    </Text>
                    {/* No pill at all rather than a "Rs. 0" one: clearing no
                        slab is not the same as earning nothing on one. */}
                    {slab ? (
                      <RosterPill label={formatRs(slab.bonus_amount)} tone="earned" />
                    ) : (
                      <Text style={[type.label, styles.noBonus]}>No slab cleared</Text>
                    )}
                  </View>
                  <Text style={type.label}>
                    {`${avgStitchesPerDay.toLocaleString()} avg stitches/day this week`}
                  </Text>
                </View>
              );
            })
          )}

          <Text style={[type.label, styles.caption]}>{ILLUSTRATIVE_NOTE}</Text>
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
    gap: spacing.tight + 2,
  },
  slab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    padding: spacing.content - 2,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.85,
  },
  slabIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.icon,
    backgroundColor: colors.neutralAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slabText: {
    flex: 1,
  },
  worker: {
    gap: spacing.hair,
    padding: spacing.content - 2,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  workerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  workerName: {
    flex: 1,
  },
  noBonus: {
    color: colors.textMuted,
  },
  caption: {
    color: colors.textSecondary,
    marginTop: spacing.tight,
  },
});
