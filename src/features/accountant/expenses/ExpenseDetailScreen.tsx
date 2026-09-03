import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Card,
  EmptyState,
  InvoiceRow,
  NoteCard,
  StaticField,
  StatusPill,
  approvalPill,
  TopBar,
} from '../../../components';
import { colors, spacing, type } from '../../../theme';
import { expenseCategoryLabel } from '../../../data/expenseCategories';
import { recurringLabel } from '../../../data/recurringTypes';
import { approvalStatusLabel, rejectReasonLabel } from '../../../data/rejectReasons';
import { useQuery } from '../../../data/useQuery';
import { formatRs } from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import { getExpense } from '../api';
import { expenseTitle } from './ExpensesTab';

type Props = NativeStackScreenProps<AccountantStackParamList, 'ExpenseDetail'>;

/**
 * Read-only, with no action buttons at all — and there must not be any.
 *
 * Approving an expense is the Company Admin's write, and it happens in that
 * module's Approvals inbox. An approve button here would be a role boundary
 * crossed in the UI, and the database would reject it anyway: this role has an
 * insert grant on `expenses` and no update grant.
 */
export function ExpenseDetailScreen({ navigation, route }: Props) {
  const { expenseId } = route.params;

  const fetcher = useCallback(() => getExpense(expenseId), [expenseId]);
  const { data: expense, loading } = useQuery(fetcher);

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={expense ? expenseTitle(expense) : 'Expense'}
        onPressBack={navigation.goBack}
      />

      {loading && !expense ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !expense ? (
        <EmptyState icon="alert-triangle" title="Could not load this expense" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <View style={styles.headerRow}>
              <Text style={type.bodyStrong}>{expenseTitle(expense)}</Text>
              <StatusPill
                status={approvalPill(expense.status)}
                label={approvalStatusLabel(expense.status)}
              />
            </View>
            <StaticField
              icon="dollar-sign"
              label={expenseCategoryLabel(expense.category)}
              value={formatRs(expense.amount)}
            />
          </Card>

          <Card title="Expense">
            <InvoiceRow
              label="Category"
              value={expenseCategoryLabel(expense.category)}
            />
            {expense.other_name ? (
              <InvoiceRow label="Name" value={expense.other_name} />
            ) : null}
            <InvoiceRow label="Amount" value={formatRs(expense.amount)} total />
            <InvoiceRow
              label="Submitted"
              value={new Date(expense.submitted_at).toLocaleDateString()}
            />
            {expense.status !== 'pending' && expense.reviewed_at ? (
              <InvoiceRow
                label={expense.status === 'approved' ? 'Approved' : 'Rejected'}
                value={new Date(expense.reviewed_at).toLocaleDateString()}
              />
            ) : null}
          </Card>

          {expense.description ? (
            <Card title="Description">
              <Text style={type.body}>{expense.description}</Text>
            </Card>
          ) : null}

          {expense.recurring_type !== 'none' ? (
            <NoteCard
              title="Recurring"
              text={`This expense repeats ${recurringLabel(expense.recurring_type).toLowerCase()}.`}
            />
          ) : null}

          {/* Rejected is a real outcome now, not the absence of approval — it
              gets its own banner and carries the reason back to whoever
              submitted the expense. */}
          {expense.status === 'approved' ? (
            <View style={styles.bannerApproved}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={[type.bodyStrong, styles.approvedLabel]}>
                Approved by Company Admin
              </Text>
            </View>
          ) : expense.status === 'rejected' ? (
            <View style={styles.bannerRejected}>
              <Feather name="x-circle" size={18} color={colors.danger} />
              <Text style={[type.bodyStrong, styles.rejectedLabel]}>
                {expense.reject_reason
                  ? `Rejected — ${rejectReasonLabel(expense.reject_reason)}`
                  : 'Rejected by Company Admin'}
              </Text>
            </View>
          ) : (
            <View style={styles.bannerPending}>
              <Feather name="clock" size={18} color={colors.warning} />
              <Text style={[type.bodyStrong, styles.pendingLabel]}>
                Waiting on Company Admin approval
              </Text>
            </View>
          )}
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
  bannerApproved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    padding: spacing.content - 2,
    borderRadius: spacing.block,
    backgroundColor: colors.successBg,
  },
  approvedLabel: {
    color: colors.success,
  },
  bannerPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    padding: spacing.content - 2,
    borderRadius: spacing.block,
    backgroundColor: colors.warningBg,
  },
  pendingLabel: {
    color: colors.warning,
  },
  bannerRejected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    padding: spacing.content - 2,
    borderRadius: spacing.block,
    backgroundColor: colors.dangerBg,
  },
  rejectedLabel: {
    color: colors.danger,
  },
});
