import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Button,
  Card,
  EmptyState,
  InvoiceRow,
  StaticField,
  StatusPill,
  TopBar,
} from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import { formatRs, loanInstallmentFor, netPayFor } from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import { getSalaryRecord, listLoans } from '../api';

type Props = NativeStackScreenProps<AccountantStackParamList, 'SalaryDetail'>;

export function SalaryDetailScreen({ navigation, route }: Props) {
  const { salaryRecordId } = route.params;
  const insets = useSafeAreaInsets();
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(async () => {
    const [record, loans] = await Promise.all([
      getSalaryRecord(salaryRecordId),
      listLoans(factoryId as string),
    ]);
    return { record, loans };
  }, [salaryRecordId, factoryId]);

  const { data, loading } = useQuery(fetcher, Boolean(factoryId));

  const record = data?.record;
  const loans = data?.loans ?? [];
  const installment = record ? loanInstallmentFor(record.person_id, loans) : 0;

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={record?.person?.full_name ?? 'Salary'}
        trailing={record?.period}
        onPressBack={navigation.goBack}
      />

      {loading && !record ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !record ? (
        <EmptyState icon="alert-triangle" title="Could not load this salary record" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <View style={styles.headerRow}>
                <Text style={type.bodyStrong}>
                  {record.person?.full_name ?? 'Unknown worker'}
                </Text>
                <StatusPill
                  status={record.paid ? 'completed' : 'draft'}
                  label={record.paid ? 'Paid' : 'Unpaid'}
                />
              </View>
              <StaticField icon="user" label="Period" value={record.period} />
            </Card>

            <Card title="Salary Breakdown">
              <InvoiceRow label="Base Pay" value={formatRs(record.base_pay)} />
              <InvoiceRow label="Bonus" value={formatRs(record.bonus)} />

              {/* All three deductions are read-only. Damage and leave are set by
                  flows that do not exist yet; the loan installment is computed. */}
              <InvoiceRow
                label="Damage Deduction"
                value={`- ${formatRs(record.damage_deduction)}`}
              />
              <Text style={type.caption}>
                {record.damage_stage
                  ? `From ${record.damage_stage}`
                  : 'No damage recorded'}
              </Text>

              <InvoiceRow
                label="Leave Deduction"
                value={`- ${formatRs(record.leave_deduction)}`}
              />
              <Text style={type.caption}>
                {record.approver?.full_name
                  ? `Approved by ${record.approver.full_name}`
                  : 'No leave recorded'}
              </Text>

              <InvoiceRow label="Loan Installment" value={`- ${formatRs(installment)}`} />
              <Text style={type.caption}>Auto-deducted from Salary each period</Text>

              <InvoiceRow
                label="Net Pay"
                value={formatRs(netPayFor(record, loans))}
                total
              />
            </Card>

            {record.paid ? (
              <View style={styles.banner}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <Text style={[type.bodyStrong, styles.bannerLabel]}>
                  Paid{' '}
                  {record.paid_at ? new Date(record.paid_at).toLocaleDateString() : ''} ·
                  Proof attached
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {record.paid ? null : (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, spacing.content) },
              ]}
            >
              <Button
                label="Pay Salary"
                flex
                onPress={() => navigation.navigate('PaySalary', { salaryRecordId })}
              />
            </View>
          )}
        </>
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
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
