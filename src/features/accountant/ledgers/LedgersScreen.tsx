import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, TabRow, TopBar, type TabDef } from '../../../components';
import { colors, spacing } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import {
  balanceForLoan,
  remainingFor,
  remainingPayableFor,
} from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import {
  listBills,
  listExpenses,
  listInvoices,
  listLoans,
  listMonthlyHistory,
  listSalaryRecords,
} from '../api';
import { ExpensesTab } from '../expenses/ExpensesTab';
import { LoansTab } from '../loans/LoansTab';
import { PayablesTab } from '../bills/PayablesTab';
import { ReceivablesTab } from '../invoices/ReceivablesTab';
import { SalaryTab } from '../salary/SalaryTab';
import { StatsTab } from '../stats/StatsTab';

type Props = NativeStackScreenProps<AccountantStackParamList, 'Ledgers'>;

type LedgerTab =
  | 'receivables'
  | 'payables'
  | 'salary'
  | 'loans'
  | 'expenses'
  | 'stats';

/**
 * The module root: six in-screen tabs over one shared load.
 *
 * Everything is fetched once here rather than per tab, because the Stats tab's
 * live current-month figures need all of it at the same time anyway, and the
 * badge counts have to reflect true unfiltered totals whichever tab is showing.
 */
export function LedgersScreen({ navigation }: Props) {
  const profile = useSession((state) => state.profile);
  const [tab, setTab] = useState<LedgerTab>('receivables');

  const factoryId = profile?.factory_id;

  const fetcher = useCallback(async () => {
    const id = factoryId as string;
    const [invoices, bills, salaries, loans, expenses, months] = await Promise.all([
      listInvoices(id),
      listBills(id),
      listSalaryRecords(id),
      listLoans(id),
      listExpenses(id),
      listMonthlyHistory(id),
    ]);
    return { invoices, bills, salaries, loans, expenses, months };
  }, [factoryId]);

  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  // Badge counts are always the true unfiltered pending count, never the
  // currently-filtered subset.
  const tabs: TabDef<LedgerTab>[] = [
    {
      key: 'receivables',
      label: 'Receivables',
      count: data?.invoices.filter((invoice) => remainingFor(invoice) > 0).length,
    },
    {
      key: 'payables',
      label: 'Payables',
      count: data?.bills.filter((bill) => remainingPayableFor(bill) > 0).length,
    },
    {
      key: 'salary',
      label: 'Salary',
      count: data?.salaries.filter((record) => !record.paid).length,
    },
    {
      key: 'loans',
      label: 'Loans',
      count: data?.loans.filter(
        (loan) => loan.status === 'approved' && balanceForLoan(loan) > 0,
      ).length,
    },
    {
      key: 'expenses',
      label: 'Expenses',
      count: data?.expenses.filter((expense) => expense.status === 'pending').length,
    },
    { key: 'stats', label: 'Stats' },
  ];

  return (
    <View style={styles.screen}>
      <TopBar variant="home" onPressNotifications={() => {}} />

      <TabRow tabs={tabs} activeKey={tab} onChange={setTab} />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Could not load ledgers" hint={error.message} />
      ) : !data ? null : (
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'receivables' ? (
            <ReceivablesTab
              invoices={data.invoices}
              onOpen={(orderId) => navigation.navigate('InvoiceDetail', { orderId })}
            />
          ) : null}

          {tab === 'payables' ? (
            <PayablesTab
              bills={data.bills}
              onOpen={(purchaseOrderId) =>
                navigation.navigate('BillDetail', { purchaseOrderId })
              }
            />
          ) : null}

          {tab === 'salary' ? (
            <SalaryTab
              records={data.salaries}
              loans={data.loans}
              onOpen={(salaryRecordId) =>
                navigation.navigate('SalaryDetail', { salaryRecordId })
              }
            />
          ) : null}

          {tab === 'loans' ? (
            <LoansTab
              loans={data.loans}
              onOpen={(loanId) => navigation.navigate('LoanDetail', { loanId })}
            />
          ) : null}

          {tab === 'expenses' ? (
            <ExpensesTab
              expenses={data.expenses}
              onAdd={() => navigation.navigate('AddExpense')}
              onOpen={(expenseId) => navigation.navigate('ExpenseDetail', { expenseId })}
            />
          ) : null}

          {tab === 'stats' ? (
            <StatsTab
              months={data.months}
              invoices={data.invoices}
              bills={data.bills}
              salaries={data.salaries}
              loans={data.loans}
              expenses={data.expenses}
            />
          ) : null}
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
    paddingBottom: spacing.content * 2,
  },
});
