import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card, DashCard, EmptyState, StatPair, TopBar } from '../../../components';
import { colors, spacing } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { getAdminSummary } from '../api';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'Dashboard'>;

/**
 * The module root.
 *
 * Only the Approvals card carries a real destination, and the numbers on it are
 * the numbers the queue actually holds — the other three count rows this role
 * owns but has no form for yet, so they say so rather than showing a plausible
 * figure behind a dead tap.
 */
export function CompanyAdminDashboardScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(
    () => getAdminSummary(factoryId as string),
    [factoryId],
  );
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const pending = data?.pending ?? [];
  const pendingExpenses = pending.filter((item) => item.kind === 'expense');
  const pendingLoans = pending.filter((item) => item.kind === 'loan');
  const pendingTotal = pending.reduce((sum, item) => sum + item.amount, 0);

  return (
    <View style={styles.screen}>
      <TopBar variant="home" />

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
          <Card title="Waiting on you">
            <StatPair
              leftLabel="Expenses"
              leftValue={String(pendingExpenses.length)}
              rightLabel="Loans"
              rightValue={String(pendingLoans.length)}
            />
            <StatPair
              leftLabel="Value pending"
              leftValue={formatRs(pendingTotal)}
              rightLabel="Decided here"
              rightValue="Approve or reject"
            />
          </Card>

          <View style={styles.grid}>
            <DashCard
              icon="inbox"
              count={pending.length}
              title="Approvals"
              subLabel={
                pending.length === 0
                  ? 'Nothing waiting'
                  : `${pendingExpenses.length} expenses, ${pendingLoans.length} loans`
              }
              tone={pending.length === 0 ? 'success' : 'warning'}
              onPress={() => navigation.navigate('Approvals')}
            />
            <DashCard
              icon="users"
              count={data?.clientCount ?? 0}
              title="Clients"
              subLabel="Roster and billing terms"
              onPress={() =>
                navigation.navigate('ComingSoon', {
                  title: 'Clients',
                  note: 'The client roster is readable today; the edit form is not specified yet.',
                })
              }
            />
            <DashCard
              icon="user-check"
              count={data?.employeeCount ?? 0}
              title="Employees"
              subLabel="Staff, partners and suppliers"
              onPress={() =>
                navigation.navigate('ComingSoon', {
                  title: 'Employees',
                  note: 'Employees, finishing partners, suppliers and bonus slabs share one form that is not specified yet.',
                })
              }
            />
            <DashCard
              icon="bar-chart-2"
              count="—"
              title="Reports"
              subLabel="Coming soon"
              tone="danger"
              onPress={() =>
                navigation.navigate('ComingSoon', { title: 'Reports' })
              }
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
    gap: spacing.block,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.block,
  },
});
