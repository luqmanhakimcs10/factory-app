import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Card,
  EmptyState,
  InvoiceRow,
  PaymentRow,
  StaticField,
  StatusPill,
  TopBar,
} from '../../../components';
import { colors, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { balanceForLoan, formatRs } from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import { getLoan } from '../api';

type Props = NativeStackScreenProps<AccountantStackParamList, 'LoanDetail'>;

/**
 * Purely informational. There is no footer and no action of any kind, and there
 * must not be one.
 *
 * An accountant does not create, edit, approve or settle a loan — recording and
 * approving belongs to another role, and repayment happens automatically as a
 * side effect of paying a salary. The only writes this module can make to a
 * loan are the `loan_history` rows that `pay_salary` appends, and it makes those
 * server-side. The database backs this up: this role has no insert or update
 * grant on `loans` or `loan_history` at all.
 */
export function LoanDetailScreen({ navigation, route }: Props) {
  const { loanId } = route.params;

  const fetcher = useCallback(() => getLoan(loanId), [loanId]);
  const { data: loan, loading } = useQuery(fetcher);

  const balance = loan ? balanceForLoan(loan) : 0;
  const settled = Boolean(loan) && balance <= 0;

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={loan?.workerName ?? 'Loan'}
        onPressBack={navigation.goBack}
      />

      {loading && !loan ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !loan ? (
        <EmptyState icon="alert-triangle" title="Could not load this loan" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <View style={styles.headerRow}>
              <Text style={type.bodyStrong}>{loan.workerName}</Text>
              <StatusPill
                status={settled ? 'completed' : 'progress'}
                label={settled ? 'Paid Off' : 'Active'}
              />
            </View>
            <StaticField
              icon="user"
              label="Recorded"
              value={new Date(loan.recordedAt).toLocaleDateString()}
            />
          </Card>

          <Card title="Loan">
            <InvoiceRow label="Principal" value={formatRs(loan.principal)} />
            <InvoiceRow label="Installment" value={formatRs(loan.installment)} />
            <Text style={type.caption}>Auto-deducted from Salary each period</Text>
            <InvoiceRow
              label="Balance Remaining"
              value={formatRs(Math.max(0, balance))}
              total
            />
          </Card>

          {loan.historyRows.length > 0 ? (
            <Card title="Installment History">
              {loan.historyRows.map((entry) => (
                <PaymentRow
                  key={entry.id}
                  amount={formatRs(entry.amount)}
                  dateLabel={`${entry.period} · ${new Date(entry.paid_at).toLocaleDateString()}`}
                  hasProof={false}
                />
              ))}
            </Card>
          ) : null}

          {settled ? (
            <View style={styles.banner}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={[type.bodyStrong, styles.bannerLabel]}>Loan fully repaid</Text>
            </View>
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
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    padding: spacing.content - 2,
    borderRadius: spacing.block,
    backgroundColor: colors.successBg,
  },
  bannerLabel: {
    color: colors.success,
  },
});
