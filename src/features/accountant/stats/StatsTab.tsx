import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChartArea, InvoiceRow, StatPair } from '../../../components';
import { colors, spacing, type } from '../../../theme';
import { expenseCategoryLabel } from '../../../data/expenseCategories';
import {
  currentMonthStats,
  currentPeriod,
  formatRs,
  isThisMonth,
  monthExpensesByCategoryTotal,
  netFor,
  totalExpensesFor,
  type LoanLike,
} from '../../../lib/ledgerMath';
import { FilterChips } from '../FilterChips';
import type { Bill, Expense, Invoice, MonthRow, SalaryRecord } from '../api';

export interface StatsTabProps {
  months: MonthRow[];
  invoices: Invoice[];
  bills: Bill[];
  salaries: SalaryRecord[];
  loans: LoanLike[];
  expenses: Expense[];
}

type Source = 'all' | 'receivables' | 'payables' | 'salary' | 'expenses';

const SOURCES: Source[] = ['all', 'receivables', 'payables', 'salary', 'expenses'];

const SOURCE_LABELS: Record<Source, string> = {
  all: 'All',
  receivables: 'Receivables',
  payables: 'Payables',
  salary: 'Salary',
  expenses: 'Expenses',
};

export function StatsTab({
  months,
  invoices,
  bills,
  salaries,
  loans,
  expenses,
}: StatsTabProps) {
  const [source, setSource] = useState<Source>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  // Current month is always recomputed from live rows — `monthly_history` holds
  // closed months only, and this one is not closed.
  const stats = currentMonthStats({
    invoicePayments: invoices.flatMap((invoice) =>
      invoice.paymentRows.filter((payment) => isThisMonth(payment.paid_at)),
    ),
    billPayments: bills.flatMap((bill) =>
      bill.paymentRows.filter((payment) => isThisMonth(payment.paid_at)),
    ),
    paidSalaries: salaries.filter(
      (record) => record.paid && record.period === currentPeriod(),
    ),
    loans,
    approvedExpenses: expenses.filter(
      (expense) => expense.status === 'approved' && isThisMonth(expense.submitted_at),
    ),
  });

  // Six most recent closed months, oldest first so the chart reads left to right.
  const recent = months.slice(-6);

  const categories = [
    ...new Set(
      months.flatMap((entry) =>
        Object.entries(entry.expenses_by_category)
          .filter(([, value]) => value > 0)
          .map(([key]) => key),
      ),
    ),
  ];

  const valueFor = (entry: MonthRow, which: Source): number => {
    switch (which) {
      case 'receivables':
        return entry.income;
      case 'payables':
        return entry.payables;
      case 'salary':
        return entry.salary;
      case 'expenses':
        return category
          ? (entry.expenses_by_category[category] ?? 0)
          : monthExpensesByCategoryTotal(entry);
      case 'all':
        return entry.income;
    }
  };

  const series =
    source === 'all'
      ? [
          { label: 'Income', color: colors.primary },
          { label: 'Expenses', color: colors.danger },
        ]
      : [
          {
            label: SOURCE_LABELS[source],
            color: source === 'receivables' ? colors.primary : colors.danger,
          },
        ];

  const columns = recent.map((entry) => ({
    label: entry.month_label,
    values:
      source === 'all'
        ? [entry.income, totalExpensesFor(entry)]
        : [valueFor(entry, source)],
  }));

  const selected =
    (month ? months.find((entry) => entry.month_label === month) : null) ??
    months[months.length - 1] ??
    null;

  return (
    <View style={styles.container}>
      <Card title="Current Month">
        <StatPair
          leftLabel="Income"
          leftValue={formatRs(stats.income)}
          rightLabel="Expenses"
          rightValue={formatRs(stats.expenses)}
          rightTone="danger"
        />
        <InvoiceRow
          label="Net So Far"
          value={formatRs(stats.net)}
          total
        />
        <Text style={[type.caption, stats.net >= 0 ? styles.positive : styles.negative]}>
          {stats.net >= 0 ? 'In profit so far this month.' : 'Behind so far this month.'}
        </Text>
        <Text style={type.caption}>
          A running total of what has actually happened this month — not a projection, and
          not from closed-month history. Loans are excluded: a disbursement or a repayment
          is its own ledger, not profit and loss.
        </Text>
      </Card>

      <FilterChips
        label="Filter by source"
        values={SOURCES.slice(1)}
        value={source === 'all' ? null : source}
        onChange={(value) => {
          setSource((value as Source) ?? 'all');
          setCategory(null);
        }}
        format={(value) => SOURCE_LABELS[value as Source]}
      />

      {source === 'expenses' ? (
        <FilterChips
          label="Filter by category"
          values={categories}
          value={category}
          onChange={setCategory}
          format={expenseCategoryLabel}
        />
      ) : null}

      <Card title="Trend">
        {recent.length === 0 ? (
          <Text style={type.label}>
            No closed months yet. This chart reads `monthly_history`, which nothing
            populates — the month-close job has not been designed.
          </Text>
        ) : (
          <ChartArea series={series} columns={columns} formatValue={formatRs} />
        )}
      </Card>

      <FilterChips
        label="Filter by month"
        values={months.map((entry) => entry.month_label)}
        value={month}
        onChange={setMonth}
        allLabel="Latest"
      />

      {selected ? (
        <>
          <Card title={selected.month_label}>
            <InvoiceRow label="Income" value={formatRs(selected.income)} />
            <InvoiceRow label="Payables" value={formatRs(selected.payables)} />
            <InvoiceRow label="Salary" value={formatRs(selected.salary)} />
            <InvoiceRow
              label="Expenses"
              value={formatRs(monthExpensesByCategoryTotal(selected))}
            />
            <InvoiceRow label="Net" value={formatRs(netFor(selected))} total />
          </Card>

          {source === 'expenses' ? (
            <Card title="Expenses by Category">
              {Object.entries(selected.expenses_by_category)
                .filter(([, value]) => value > 0)
                .map(([key, value]) => (
                  <InvoiceRow
                    key={key}
                    label={expenseCategoryLabel(key)}
                    value={formatRs(value)}
                  />
                ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.block,
  },
  positive: {
    color: colors.success,
  },
  negative: {
    color: colors.danger,
  },
});
