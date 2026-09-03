import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  platformColors,
  platformSpacing,
  platformType,
} from '../../../theme-platform';
import { useQuery } from '../../../data/useQuery';
import type { SuperAdminStackParamList } from '../../../navigation/SuperAdminStack';
import {
  InfoCell,
  PlatformButton,
  PlatformCard,
  PlatformTopBar,
  StatCard,
  StatusBadge,
} from '../components';
import { FactoryFormModal } from '../modals/FactoryFormModal';
import {
  createFactory,
  dashboardStats,
  formatDate,
  formatMoney,
  listAllPayments,
  listFactories,
  listModules,
  type Factory,
} from '../api';

type Props = NativeStackScreenProps<SuperAdminStackParamList, 'PlatformDashboard'>;

/**
 * Every tenant on one screen.
 *
 * The four stat cards cycle primary/secondary/success/error purely as a visual
 * rotation — the colour carries no good/bad meaning, so Past Dues being red is
 * position, not judgement.
 */
const STAT_COLORS = [
  platformColors.accentPrimary,
  platformColors.accentSecondary,
  platformColors.accentSuccess,
  platformColors.accentError,
];

export function PlatformDashboardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [adding, setAdding] = useState(false);

  const fetcher = useCallback(async () => {
    const [factories, payments, modules] = await Promise.all([
      listFactories(),
      listAllPayments(),
      listModules(),
    ]);
    return { factories, payments, modules };
  }, []);

  // `useQuery` already refetches on focus, so returning from a detail screen
  // re-derives every stat below without any extra wiring here.
  const { data, loading, error, refetch } = useQuery(fetcher);

  const stats = data ? dashboardStats(data.factories, data.payments) : null;

  const cards: { label: string; value: string }[] = stats
    ? [
        { label: 'Total Factories', value: String(stats.totalFactories) },
        { label: 'Active Factories', value: String(stats.activeFactories) },
        { label: 'Monthly Revenue', value: formatMoney(stats.monthlyRevenue) },
        { label: 'Past Dues', value: formatMoney(stats.pastDues) },
      ]
    : [];

  const renderFactory = (factory: Factory) => (
    <Pressable
      key={factory.id}
      accessibilityRole="button"
      onPress={() =>
        navigation.navigate('PlatformFactoryDetail', { factoryId: factory.id })
      }
    >
      <PlatformCard>
        <View style={styles.cardHeader}>
          <Text style={platformType.bodyStrong} numberOfLines={1}>
            {factory.name}
          </Text>
          <StatusBadge status={factory.status} />
        </View>
        <View style={styles.grid}>
          <InfoCell label="Responsible" value={factory.responsible_person ?? ''} />
          <InfoCell
            label="Employees"
            value={factory.employees_count?.toString() ?? ''}
          />
          <InfoCell
            label="Subscription"
            value={factory.subscription_fee ? formatMoney(factory.subscription_fee) : ''}
          />
          <InfoCell label="Started" value={formatDate(factory.starting_date)} />
          <InfoCell label="Due" value={formatDate(factory.due_date)} full />
        </View>
      </PlatformCard>
    </Pressable>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PlatformTopBar
        title="Platform Console"
        subtitle="Every factory on FactoryERP"
        trailing={<PlatformButton label="Add" icon="plus" onPress={() => setAdding(true)} />}
      />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={platformColors.accentPrimary} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={platformType.bodyStrong}>Could not load the platform data</Text>
          <Text style={platformType.caption}>{error.message}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statRow}>
            {cards.map((card, index) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                color={STAT_COLORS[index % STAT_COLORS.length] as string}
              />
            ))}
          </View>

          <Text style={platformType.heading}>Factories</Text>
          {/* Active and inactive together, unfiltered — an operator wants the
              whole book, and a lapsed tenant is the one you most need to see. */}
          {data && data.factories.length > 0 ? (
            data.factories.map(renderFactory)
          ) : (
            <PlatformCard>
              <Text style={platformType.bodyStrong}>No factories yet</Text>
              <Text style={platformType.caption}>
                Use Add to onboard the first tenant.
              </Text>
            </PlatformCard>
          )}
        </ScrollView>
      )}

      <FactoryFormModal
        visible={adding}
        factory={null}
        initialModuleIds={[]}
        modules={data?.modules ?? []}
        onClose={() => setAdding(false)}
        onSubmit={async (draft) => {
          await createFactory(draft);
          await refetch();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: platformColors.bgApp },
  loader: { marginTop: platformSpacing.content * 3 },
  empty: { padding: platformSpacing.content, gap: platformSpacing.hair },
  content: { padding: platformSpacing.content, gap: platformSpacing.block },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: platformSpacing.tight,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: platformSpacing.tight,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: platformSpacing.tight,
    columnGap: platformSpacing.tight,
  },
});
