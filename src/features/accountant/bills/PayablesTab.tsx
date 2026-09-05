import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  EmptyState,
  FilterChips,
  SourceTag,
  StatusPill,
  dayOf,
  distinct,
  formatDay,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { amountPaidFor, formatRs, remainingPayableFor } from '../../../lib/ledgerMath';
import type { Bill } from '../api';

export interface PayablesTabProps {
  /** Confirmed purchase orders only — see the RLS note in `api.ts`. */
  bills: Bill[];
  onOpen: (purchaseOrderId: string) => void;
}

export function PayablesTab({ bills, onOpen }: PayablesTabProps) {
  const [supplier, setSupplier] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);

  const suppliers = distinct(bills, (bill) => bill.supplierName);
  const days = distinct(bills, (bill) => dayOf(bill.date));

  const visible = bills.filter(
    (bill) =>
      (supplier === null || bill.supplierName === supplier) &&
      (day === null || dayOf(bill.date) === day),
  );

  const awaiting = visible.filter((bill) => remainingPayableFor(bill) > 0);
  const paid = visible.filter((bill) => remainingPayableFor(bill) <= 0);

  return (
    <View style={styles.container}>
      <FilterChips
        label="Filter by supplier"
        values={suppliers}
        value={supplier}
        onChange={setSupplier}
      />
      <FilterChips
        label="Filter by date"
        values={days}
        value={day}
        onChange={setDay}
        format={formatDay}
      />

      <Text style={type.heading}>Awaiting Payment</Text>
      {awaiting.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Nothing to pay"
          hint="Only confirmed purchase orders appear here."
        />
      ) : (
        awaiting.map((bill) => (
          <BillCard key={bill.id} bill={bill} onPress={() => onOpen(bill.id)} />
        ))
      )}

      <Text style={[type.heading, styles.sectionGap]}>Paid</Text>
      {paid.length === 0 ? (
        <EmptyState icon="inbox" title="Nothing settled yet" />
      ) : (
        paid.map((bill) => (
          <BillCard key={bill.id} bill={bill} onPress={() => onOpen(bill.id)} />
        ))
      )}
    </View>
  );
}

function BillCard({ bill, onPress }: { bill: Bill; onPress: () => void }) {
  const remaining = remainingPayableFor(bill);
  const settled = remaining <= 0;
  const partial = !settled && amountPaidFor(bill) > 0;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Text style={type.code}>{bill.poNumber}</Text>
        <StatusPill
          status={settled ? 'completed' : partial ? 'progress' : 'draft'}
          label={settled ? 'Paid' : partial ? 'Partially Paid' : 'Awaiting Payment'}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.text}>
          <Text style={type.bodyStrong} numberOfLines={1}>
            {bill.supplierName ?? 'Unassigned supplier'}
          </Text>
          <SourceTag
            label={bill.source === 'manual' ? 'MANUAL' : 'SYSTEM-GENERATED'}
            style={styles.tag}
          />
        </View>
        <Text style={[type.code, styles.amount, settled && styles.amountPaid]}>
          {formatRs(Math.max(0, remaining))}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.tight + 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.content - 2,
    gap: spacing.tight - 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  text: {
    flex: 1,
    gap: spacing.hair,
  },
  tag: {
    marginTop: 2,
  },
  amount: {
    fontSize: 17,
    color: colors.textPrimary,
  },
  amountPaid: {
    color: colors.textMuted,
  },
  sectionGap: {
    marginTop: spacing.tight,
  },
});
