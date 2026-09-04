import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card, DashCard, EmptyState, TopBar } from '../../../components';
import { colors, fonts, spacing } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { getAdminSummary } from '../api';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'Dashboard'>;

/**
 * The module root: a live P&L mirror, then the seven sections this role owns.
 *
 * The P&L card is read-only by design. It reflects the Accountant's Ledgers —
 * nothing on it is tappable, and nothing here writes money. The grid below is
 * seven single-tap destinations; the icon-square colours cycle blue / green /
 * amber purely for rhythm and mean nothing about status.
 *
 * Employees, Finishing Partners and Suppliers get three separate cards because
 * they are three separate tables with different columns — an employee has a
 * CNIC and a salary basis, a supplier has an inventory type and a payment
 * cycle, a finishing partner has a stage type and a per-repeat rate. Folding
 * them into one "staff" roster in the UI is what would push somebody to fold
 * them into one table, and Store Manager's supplier picker and Floor Manager's
 * partner assignment both need to query these lists independently.
 */
export function CompanyAdminDashboardScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(
    () => getAdminSummary(factoryId as string),
    [factoryId],
  );
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const pending = data?.pending ?? [];

  const comingSoon = (title: string, note?: string) =>
    navigation.navigate('ComingSoon', { title, note });

  return (
    <View style={styles.screen}>
      <TopBar
        variant="home"
        showSignOut={false}
        onPressNotifications={() =>
          comingSoon(
            'Notifications',
            'There is no notifications table yet, so the bell has nothing to count.',
          )
        }
      />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error || !data ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load the dashboard"
          hint={error?.message}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.pnlCard}>
            <Text style={styles.pnlLabel}>
              {`P&L Snapshot · ${data.monthLabel}`}
            </Text>

            <View style={styles.statRow}>
              <View>
                <Text style={styles.statLabel}>INCOME</Text>
                <Text style={[styles.statValue, styles.income]}>
                  {formatRs(data.pnl.income)}
                </Text>
              </View>
              <View style={styles.statRight}>
                <Text style={[styles.statLabel, styles.right]}>EXPENSES</Text>
                <Text style={[styles.statValue, styles.outgoing, styles.right]}>
                  {formatRs(data.pnl.expenses)}
                </Text>
              </View>
            </View>

            <View style={styles.netRow}>
              <Text style={styles.netLabel}>Net So Far</Text>
              <Text
                style={[
                  styles.netValue,
                  data.pnl.net < 0 ? styles.outgoing : styles.positive,
                ]}
              >
                {/* A loss reads "− Rs. 37,500"; a profit carries no sign at all,
                    so the minus is the thing the eye catches. */}
                {data.pnl.net < 0
                  ? `− ${formatRs(Math.abs(data.pnl.net))}`
                  : formatRs(data.pnl.net)}
              </Text>
            </View>

            <Text style={styles.pnlCaption}>
              Recorded so far this month, mirrored from the Accountant&apos;s Ledgers
              — updates as payments and approvals come in.
            </Text>
          </Card>

          <View style={styles.grid}>
            <DashCard
              icon="inbox"
              count={pending.length}
              title="Approvals Inbox"
              subLabel={
                pending.length === 1
                  ? '1 item awaiting you'
                  : `${pending.length} items awaiting you`
              }
              onPress={() => navigation.navigate('Approvals')}
            />
            <DashCard
              icon="bar-chart-2"
              title="Reports Hub"
              subLabel="P&L, per-order profitability, leakage, productivity, uptime"
              tone="success"
              onPress={() =>
                comingSoon(
                  'Reports Hub',
                  'The five report tabs are specified but not built yet.',
                )
              }
            />
            <DashCard
              icon="layers"
              count={data.bonusSlabCount}
              title="Bonus Slab Config"
              subLabel="Daily-stitch threshold → bonus amount"
              tone="warning"
              onPress={() => comingSoon('Bonus Slab Config')}
            />
            <DashCard
              icon="users"
              count={data.employeeCount}
              title="Employees"
              subLabel="Roster — name, role, contact"
              onPress={() => comingSoon('Employees')}
            />
            <DashCard
              icon="scissors"
              count={data.finishingPartnerCount}
              title="Finishing Partners"
              subLabel="External roster — Clipping, Piko, Press"
              tone="success"
              onPress={() => comingSoon('Finishing Partners')}
            />
            <DashCard
              icon="truck"
              count={data.supplierCount}
              title="Suppliers"
              subLabel="Who the factory buys inventory from"
              tone="warning"
              onPress={() => comingSoon('Suppliers')}
            />
            <DashCard
              icon="briefcase"
              count={data.clientCount}
              title="Clients"
              subLabel="Who the factory bills — billing type, rate"
              onPress={() => comingSoon('Clients')}
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
  pnlCard: {
    gap: spacing.tight + 2,
  },
  pnlLabel: {
    fontFamily: fonts.sans.semibold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.55,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statRight: {
    alignItems: 'flex-end',
  },
  statLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  statValue: {
    fontFamily: fonts.mono.bold,
    fontSize: 16,
    lineHeight: 22,
  },
  right: {
    textAlign: 'right',
  },
  income: {
    color: colors.primary,
  },
  outgoing: {
    color: colors.danger,
  },
  positive: {
    color: colors.success,
  },
  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  netLabel: {
    fontFamily: fonts.sans.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  netValue: {
    fontFamily: fonts.mono.bold,
    fontSize: 17,
    lineHeight: 23,
  },
  pnlCaption: {
    fontFamily: fonts.sans.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
