import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState } from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { formatRs } from '../../../lib/ledgerMath';
import { SectionLabel, reportStyles } from '../components';
import type { OrderProfit } from '../reports';

/**
 * The cost column's heading, and it is doing real work.
 *
 * It names the three things the figure is made of instead of saying "Cost",
 * because the figure is an apportionment (see `getOrderProfits`) and not an
 * itemised cost anyone recorded against this order. An owner reading "Cost"
 * would reasonably believe someone had costed the job.
 */
const COST_HEADING = 'Thread + Labor + Finishing';

export function PerOrderTab({ orders }: { orders: OrderProfit[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="bar-chart-2"
        title="No priced orders this month"
        hint="An order appears here once its client has billing terms set — profitability needs a rate to measure against."
      />
    );
  }

  return (
    <View style={styles.tab}>
      <SectionLabel>Per-Order Profitability</SectionLabel>

      {orders.map((order) => (
        <Card key={order.id} style={styles.card}>
          <View style={styles.header}>
            <Text style={[type.bodyStrong, styles.client]} numberOfLines={1}>
              {order.clientName}
            </Text>
            <Text style={type.code}>{order.code}</Text>
          </View>

          <View style={styles.split}>
            <View style={styles.half}>
              <Text style={[type.caption, styles.columnLabel]}>REVENUE</Text>
              <Text style={[reportStyles.figure, styles.revenue]}>
                {formatRs(order.revenue)}
              </Text>
            </View>
            <View style={[styles.half, styles.right]}>
              <Text style={[type.caption, styles.columnLabel, styles.rightText]}>
                {COST_HEADING.toUpperCase()}
              </Text>
              <Text style={[reportStyles.figure, styles.cost, styles.rightText]}>
                {formatRs(order.cost)}
              </Text>
            </View>
          </View>

          <View style={styles.netRow}>
            <Text style={[type.bodyStrong, styles.netLabel]}>Net Profit</Text>
            <Text
              style={[
                reportStyles.figure,
                order.net < 0 ? styles.cost : styles.net,
              ]}
            >
              {order.net < 0
                ? `− ${formatRs(Math.abs(order.net))}`
                : formatRs(order.net)}
              {order.marginPct === null ? '' : `  ·  ${order.marginPct}% margin`}
            </Text>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: {
    gap: spacing.tight + 2,
  },
  card: {
    gap: spacing.tight + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  client: {
    flex: 1,
  },
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.tight,
  },
  half: {
    flex: 1,
    gap: 2,
  },
  right: {
    alignItems: 'flex-end',
  },
  rightText: {
    textAlign: 'right',
  },
  columnLabel: {
    letterSpacing: 0.5,
  },
  revenue: {
    color: colors.primary,
  },
  cost: {
    color: colors.danger,
  },
  net: {
    color: colors.success,
  },
  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
    paddingTop: spacing.tight + 2,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.borderSubtle,
  },
  netLabel: {
    color: colors.textSecondary,
  },
});
