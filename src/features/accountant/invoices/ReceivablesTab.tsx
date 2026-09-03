import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, StatusPill } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { amountPaidFor, formatRs, remainingFor } from '../../../lib/ledgerMath';
import { FilterChips, dayOf, distinct, formatDay } from '../FilterChips';
import type { Invoice } from '../api';

export interface ReceivablesTabProps {
  invoices: Invoice[];
  onOpen: (orderId: string) => void;
}

export function ReceivablesTab({ invoices, onOpen }: ReceivablesTabProps) {
  const [client, setClient] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);

  const clients = distinct(invoices, (invoice) => invoice.clientName);
  const days = distinct(invoices, (invoice) => dayOf(invoice.createdAt));

  const visible = invoices.filter(
    (invoice) =>
      (client === null || invoice.clientName === client) &&
      (day === null || dayOf(invoice.createdAt) === day),
  );

  const awaiting = visible.filter((invoice) => remainingFor(invoice) > 0);
  const paid = visible.filter((invoice) => remainingFor(invoice) <= 0);

  return (
    <View style={styles.container}>
      <FilterChips
        label="Filter by client"
        values={clients}
        value={client}
        onChange={setClient}
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
        <EmptyState icon="inbox" title="Nothing outstanding" />
      ) : (
        awaiting.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} onPress={() => onOpen(invoice.id)} />
        ))
      )}

      <Text style={[type.heading, styles.sectionGap]}>Paid</Text>
      {paid.length === 0 ? (
        <EmptyState icon="inbox" title="Nothing settled yet" />
      ) : (
        paid.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} onPress={() => onOpen(invoice.id)} />
        ))
      )}
    </View>
  );
}

function InvoiceCard({ invoice, onPress }: { invoice: Invoice; onPress: () => void }) {
  const remaining = remainingFor(invoice);
  const settled = remaining <= 0;
  // A part-paid invoice reads differently from one nobody has paid against.
  const partial = !settled && amountPaidFor(invoice) > 0;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Text style={type.code}>{invoice.code}</Text>
        <StatusPill
          status={settled ? 'completed' : partial ? 'progress' : 'draft'}
          label={settled ? 'Paid' : partial ? 'Partially Paid' : 'Awaiting Payment'}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.text}>
          <Text style={type.bodyStrong} numberOfLines={1}>
            {invoice.clientName}
          </Text>
          <Text style={type.label}>{invoice.designCode ?? 'No design code'}</Text>
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
