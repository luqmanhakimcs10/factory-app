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
  ItemRow,
  PaymentRow,
  SourceTag,
  StatusPill,
  TopBar,
} from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import {
  amountPaidFor,
  formatRs,
  remainingPayableFor,
  totalBillForBill,
} from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import { getBill } from '../api';

type Props = NativeStackScreenProps<AccountantStackParamList, 'BillDetail'>;

export function BillDetailScreen({ navigation, route }: Props) {
  const { purchaseOrderId } = route.params;
  const insets = useSafeAreaInsets();

  const fetcher = useCallback(() => getBill(purchaseOrderId), [purchaseOrderId]);
  const { data: bill, loading } = useQuery(fetcher);

  const remaining = bill ? remainingPayableFor(bill) : 0;
  const settled = Boolean(bill) && remaining <= 0;

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={bill?.poNumber ?? 'Bill'}
        trailing={settled ? 'Paid' : undefined}
        onPressBack={navigation.goBack}
      />

      {loading && !bill ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !bill ? (
        <EmptyState icon="alert-triangle" title="Could not load this bill" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <View style={styles.headerRow}>
                <Text style={type.code}>{bill.poNumber}</Text>
                <StatusPill
                  status={settled ? 'completed' : 'progress'}
                  label={settled ? 'Paid' : 'Awaiting Payment'}
                />
              </View>
              <Text style={type.bodyStrong}>
                {bill.supplierName ?? 'Unassigned supplier'}
              </Text>
              <Text style={type.label}>{new Date(bill.date).toLocaleDateString()}</Text>
              <SourceTag
                label={bill.source === 'manual' ? 'MANUAL' : 'SYSTEM-GENERATED'}
              />
            </Card>

            <Card title="Items">
              {bill.itemRows.length === 0 ? (
                <EmptyState icon="inbox" title="No lines on this purchase order" />
              ) : (
                bill.itemRows.map((item) => (
                  <ItemRow
                    key={item.id}
                    colorId={item.colorId}
                    hex={item.hex}
                    label={item.label}
                    quantity={item.quantity}
                    price={formatRs(item.price)}
                  />
                ))
              )}
            </Card>

            <Card title="Bill">
              <InvoiceRow label="Total Bill" value={formatRs(totalBillForBill(bill))} />
              <InvoiceRow label="Amount Paid" value={formatRs(amountPaidFor(bill))} />
              <InvoiceRow
                label="Remaining Payable"
                value={formatRs(Math.max(0, remaining))}
                total
              />
            </Card>

            {bill.paymentRows.length > 0 ? (
              <Card title="Payment History">
                {bill.paymentRows.map((payment) => (
                  <PaymentRow
                    key={payment.id}
                    amount={formatRs(payment.amount)}
                    dateLabel={new Date(payment.paid_at).toLocaleDateString()}
                    recordedBy={payment.recorder?.full_name}
                  />
                ))}
              </Card>
            ) : null}

            {settled ? (
              <View style={styles.banner}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <Text style={[type.bodyStrong, styles.bannerLabel]}>Paid in full</Text>
              </View>
            ) : null}
          </ScrollView>

          {settled ? null : (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, spacing.content) },
              ]}
            >
              <Button
                label="Pay Now"
                flex
                onPress={() => navigation.navigate('PayBill', { purchaseOrderId })}
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
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
