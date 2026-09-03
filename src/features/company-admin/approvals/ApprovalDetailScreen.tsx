import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  BottomSheetModal,
  Button,
  Card,
  EmptyState,
  InvoiceRow,
  NoteCard,
  StaticField,
  StatusPill,
  approvalPill,
  TopBar,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { expenseCategoryLabel } from '../../../data/expenseCategories';
import { recurringLabel } from '../../../data/recurringTypes';
import {
  approvalStatusLabel,
  rejectReasonLabel,
  REJECT_REASONS,
  type RejectReason,
} from '../../../data/rejectReasons';
import { useQuery } from '../../../data/useQuery';
import { notify } from '../../../lib/alert';
import { approveRecord, rejectRecord } from '../../../lib/approvalMutations';
import { formatRs } from '../../../lib/ledgerMath';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import {
  expenseTitle,
  getExpenseForReview,
  getLoanForReview,
  type ExpenseRecord,
  type LoanRecord,
} from '../api';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'ApprovalDetail'>;

type Review =
  | { kind: 'expense'; expense: ExpenseRecord }
  | { kind: 'loan'; loan: LoanRecord };

/**
 * The one screen in the app where this role writes anything.
 *
 * Approve is a single tap; reject is not. A rejection has to carry one of the
 * four `reject_reason` values, because the accountant's Expense Detail renders
 * that reason back as the entire explanation of why their submission came back
 * — a reason-less rejection would be indistinguishable there from the record
 * never having been looked at.
 *
 * Both actions go through `lib/approvalMutations`, whose RPCs re-check the
 * caller's role server-side. The buttons below are presentation; that check is
 * the control.
 */
export function ApprovalDetailScreen({ navigation, route }: Props) {
  const { kind, id } = route.params;
  const insets = useSafeAreaInsets();
  const [reasonSheet, setReasonSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(async (): Promise<Review> => {
    if (kind === 'expense') {
      return { kind: 'expense', expense: await getExpenseForReview(id) };
    }
    return { kind: 'loan', loan: await getLoanForReview(id) };
  }, [kind, id]);

  const { data, loading, refetch } = useQuery(fetcher);

  const status = data
    ? data.kind === 'expense'
      ? data.expense.status
      : data.loan.status
    : null;

  const rejectReason = data
    ? data.kind === 'expense'
      ? data.expense.reject_reason
      : data.loan.rejectReason
    : null;

  const title = data
    ? data.kind === 'expense'
      ? expenseTitle(data.expense)
      : data.loan.workerName
    : kind === 'expense'
      ? 'Expense'
      : 'Loan';

  const decide = async (run: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await run();
      setReasonSheet(false);
      notify(done);
      // Pop rather than stay: the inbox refetches on focus, so the row this
      // decision just moved out of Pending is gone by the time it is seen.
      navigation.goBack();
    } catch (caught) {
      setReasonSheet(false);
      notify(
        'Could not save that decision',
        caught instanceof Error ? caught.message : String(caught),
      );
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const approve = () =>
    decide(() => approveRecord(kind, id), 'Approved');

  const reject = (reason: RejectReason) =>
    decide(() => rejectRecord(kind, id, reason), 'Rejected');

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={title} onPressBack={navigation.goBack} />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !data || !status ? (
        <EmptyState icon="alert-triangle" title="Could not load this record" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <View style={styles.headerRow}>
                <Text style={type.bodyStrong}>{title}</Text>
                <StatusPill
                  status={approvalPill(status)}
                  label={approvalStatusLabel(status)}
                />
              </View>
              <StaticField
                icon={data.kind === 'expense' ? 'dollar-sign' : 'credit-card'}
                label={
                  data.kind === 'expense'
                    ? expenseCategoryLabel(data.expense.category)
                    : 'Loan principal'
                }
                value={formatRs(
                  data.kind === 'expense'
                    ? data.expense.amount
                    : data.loan.principal,
                )}
              />
            </Card>

            {data.kind === 'expense' ? (
              <Card title="Expense">
                <InvoiceRow
                  label="Category"
                  value={expenseCategoryLabel(data.expense.category)}
                />
                {data.expense.other_name ? (
                  <InvoiceRow label="Name" value={data.expense.other_name} />
                ) : null}
                <InvoiceRow
                  label="Amount"
                  value={formatRs(data.expense.amount)}
                  total
                />
                <InvoiceRow
                  label="Submitted"
                  value={new Date(data.expense.submitted_at).toLocaleDateString()}
                />
                {data.expense.reviewed_at ? (
                  <InvoiceRow
                    label="Reviewed"
                    value={new Date(data.expense.reviewed_at).toLocaleDateString()}
                  />
                ) : null}
              </Card>
            ) : (
              <Card title="Loan">
                <InvoiceRow label="Worker" value={data.loan.workerName} />
                <InvoiceRow
                  label="Principal"
                  value={formatRs(data.loan.principal)}
                  total
                />
                <InvoiceRow
                  label="Instalment"
                  value={formatRs(data.loan.installment)}
                />
                <InvoiceRow
                  label="Recorded"
                  value={new Date(data.loan.recordedAt).toLocaleDateString()}
                />
              </Card>
            )}

            {data.kind === 'expense' && data.expense.description ? (
              <Card title="Description">
                <Text style={type.body}>{data.expense.description}</Text>
              </Card>
            ) : null}

            {data.kind === 'expense' && data.expense.recurring_type !== 'none' ? (
              <NoteCard
                title="Recurring"
                text={`Approving this approves a charge that repeats ${recurringLabel(
                  data.expense.recurring_type,
                ).toLowerCase()}.`}
              />
            ) : null}

            {status === 'rejected' ? (
              <View style={styles.bannerRejected}>
                <Feather name="x-circle" size={18} color={colors.danger} />
                <Text style={[type.bodyStrong, styles.rejectedLabel]}>
                  {rejectReason
                    ? `Rejected — ${rejectReasonLabel(rejectReason)}`
                    : 'Rejected'}
                </Text>
              </View>
            ) : status === 'approved' ? (
              <View style={styles.bannerApproved}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <Text style={[type.bodyStrong, styles.approvedLabel]}>
                  Approved
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* A decided record keeps its detail but loses its buttons — the RPCs
              refuse a second decision anyway, and offering one here would put
              the refusal in an error dialog instead of in the UI. */}
          {status === 'pending' ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, spacing.content) },
              ]}
            >
              <Button
                label="Reject"
                tone="danger"
                icon="x"
                flex
                disabled={busy}
                onPress={() => setReasonSheet(true)}
              />
              <Button
                label="Approve"
                icon="check"
                flex
                loading={busy}
                onPress={approve}
              />
            </View>
          ) : null}
        </>
      )}

      <BottomSheetModal visible={reasonSheet} onClose={() => setReasonSheet(false)}>
        <Text style={type.heading}>Why is this rejected?</Text>
        <Text style={[type.label, styles.reasonHint]}>
          The reason is shown to whoever submitted it.
        </Text>
        {REJECT_REASONS.map((reason) => (
          <Pressable
            key={reason}
            accessibilityRole="button"
            disabled={busy}
            style={styles.reason}
            onPress={() => reject(reason)}
          >
            <Text style={type.body}>{rejectReasonLabel(reason)}</Text>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </BottomSheetModal>
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
    borderRadius: radius.card,
    backgroundColor: colors.successBg,
  },
  approvedLabel: {
    color: colors.success,
  },
  bannerRejected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    padding: spacing.content - 2,
    borderRadius: radius.card,
    backgroundColor: colors.dangerBg,
  },
  rejectedLabel: {
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.tight + 2,
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
  reasonHint: {
    marginBottom: spacing.tight,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.content - 2,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.borderSubtle,
  },
});
