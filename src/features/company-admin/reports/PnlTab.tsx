import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, FilterChips } from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { formatRs } from '../../../lib/ledgerMath';
import { SectionLabel, reportStyles } from '../components';
import type { PnlMonth } from '../reports';

/**
 * Verbatim, and not to be paraphrased.
 *
 * The sentence is the whole reason the Loans ledger's cash flow is missing from
 * a page headed "profit and loss", and an owner who cannot find it there needs
 * to read exactly why rather than a summary of why.
 */
const EXCLUDES_LOANS_CAPTION =
  "Excludes Loans — a loan is repaid, not earned or spent, so it never touches P&L. Mirrored live from the Accountant's Ledgers.";

/** The four rows above the rule, in this order. Net is rendered separately. */
function figures(month: PnlMonth) {
  return [
    { label: 'Income', value: month.income },
    { label: 'Payables', value: month.payables },
    { label: 'Salary', value: month.salary },
    { label: 'Fixed Expenses', value: month.fixedExpenses },
  ];
}

function MonthCard({
  heading,
  month,
  caption,
}: {
  heading: string;
  month: PnlMonth;
  caption?: string;
}) {
  return (
    <Card style={styles.card}>
      <SectionLabel>{heading}</SectionLabel>

      {figures(month).map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={[type.bodyStrong, styles.rowLabel]}>{row.label}</Text>
          <Text style={reportStyles.figure}>{formatRs(row.value)}</Text>
        </View>
      ))}

      <View style={[styles.row, styles.netRow]}>
        <Text style={[type.bodyStrong, styles.rowLabel]}>Net So Far</Text>
        {/* A loss reads "− Rs. 37,500" in red; a profit is green and carries no
            sign at all, so the minus is the thing the eye catches. */}
        <Text
          style={[
            reportStyles.figure,
            month.net < 0 ? styles.negative : styles.positive,
          ]}
        >
          {month.net < 0
            ? `− ${formatRs(Math.abs(month.net))}`
            : formatRs(month.net)}
        </Text>
      </View>

      {caption ? <Text style={[type.label, styles.caption]}>{caption}</Text> : null}
    </Card>
  );
}

/**
 * Profit and loss: this month live, then any closed month on demand.
 *
 * The current-month card is always shown and always recomputed from live rows.
 * The month chips read `monthly_history`, which holds closed months only — so
 * picking one adds a second card rather than replacing the first, because the
 * two answer different questions and a filter that hid "so far this month"
 * would make the default view unreachable.
 */
export function PnlTab({ current, closed }: { current: PnlMonth; closed: PnlMonth[] }) {
  const [month, setMonth] = useState<string | null>(null);
  const selected = month ? closed.find((entry) => entry.label === month) : null;

  return (
    <View style={styles.tab}>
      <MonthCard
        heading={`Current Month · ${current.label}`}
        month={current}
        caption={EXCLUDES_LOANS_CAPTION}
      />

      <FilterChips
        label="Filter by month"
        values={closed.map((entry) => entry.label)}
        value={month}
        onChange={setMonth}
        allLabel="Latest"
      />

      {selected ? <MonthCard heading={selected.label} month={selected} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: {
    gap: spacing.block,
  },
  card: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
    paddingVertical: spacing.tight + 4,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  netRow: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    color: colors.textSecondary,
  },
  positive: {
    color: colors.success,
  },
  negative: {
    color: colors.danger,
  },
  caption: {
    color: colors.textSecondary,
    paddingTop: spacing.tight + 2,
  },
});
