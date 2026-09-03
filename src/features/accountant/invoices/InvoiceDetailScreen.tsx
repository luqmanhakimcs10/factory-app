import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Button,
  Card,
  ColorSwatch,
  EmptyState,
  InvoiceRow,
  PaymentRow,
  StatusPill,
  TopBar,
} from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { getSwatch } from '../../../data/swatches';
import { useQuery } from '../../../data/useQuery';
import {
  amountPaidFor,
  billingModeLabel,
  formatRs,
  remainingFor,
  totalBillFor,
} from '../../../lib/ledgerMath';
import type { AccountantStackParamList } from '../../../navigation/AccountantStack';
import { getInvoice } from '../api';

type Props = NativeStackScreenProps<AccountantStackParamList, 'InvoiceDetail'>;

export function InvoiceDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();

  const fetcher = useCallback(() => getInvoice(orderId), [orderId]);
  const { data: invoice, loading } = useQuery(fetcher);

  const remaining = invoice ? remainingFor(invoice) : 0;
  const settled = Boolean(invoice) && remaining <= 0;

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={invoice?.code ?? 'Invoice'}
        trailing={settled ? 'Paid' : undefined}
        onPressBack={navigation.goBack}
      />

      {loading && !invoice ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !invoice ? (
        <EmptyState icon="alert-triangle" title="Could not load this invoice" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <View style={styles.headerRow}>
                <Text style={type.code}>{invoice.code}</Text>
                <StatusPill
                  status={settled ? 'completed' : 'progress'}
                  label={settled ? 'Paid' : 'Awaiting Payment'}
                />
              </View>
              <Text style={type.bodyStrong}>{invoice.clientName}</Text>
              <Text style={type.label}>{invoice.designCode ?? 'No design code'}</Text>
            </Card>

            <Card title="Sheets">
              {invoice.sheetRows.map((sheet) => (
                <View key={sheet.id} style={styles.sheetRow}>
                  <ColorSwatch
                    colorId={sheet.colorId}
                    customHex={sheet.customHex}
                    size={20}
                    interactive={false}
                  />
                  <Text style={type.body}>
                    {getSwatch(sheet.colorId)?.label ?? sheet.colorId} ·{' '}
                    {sheet.repeats} {sheet.repeats === 1 ? 'repeat' : 'repeats'}
                  </Text>
                </View>
              ))}
            </Card>

            <Card title="Invoice">
              <InvoiceRow label="Total Bill" value={formatRs(totalBillFor(invoice))} />
              <Text style={type.caption}>{billingModeLabel(invoice.billing)}</Text>

              {/* Set by the floor manager on Production Detail. Never editable here. */}
              <InvoiceRow
                label="Damaged Repeats Price"
                value={`- ${formatRs(invoice.damagedRepeatsPrice)}`}
              />
              <InvoiceRow label="Amount Received" value={formatRs(amountPaidFor(invoice))} />
              <InvoiceRow
                label="Remaining Receivable"
                value={formatRs(Math.max(0, remaining))}
                total
              />
            </Card>

            {invoice.paymentRows.length > 0 ? (
              <Card title="Payment History">
                {invoice.paymentRows.map((payment) => (
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

          {/* Hidden once settled — there is nothing left to record. */}
          {settled ? null : (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, spacing.content) },
              ]}
            >
              <Button
                label="Record Payment"
                flex
                onPress={() => navigation.navigate('RecordPayment', { orderId })}
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
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
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
