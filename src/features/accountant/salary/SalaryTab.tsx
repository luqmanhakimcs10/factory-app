import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  EmptyState,
  FilterChips,
  StatusPill,
  distinct,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { formatRs, netPayFor, type LoanLike } from '../../../lib/ledgerMath';
import type { SalaryRecord } from '../api';

export interface SalaryTabProps {
  records: SalaryRecord[];
  /** Needed for the loan installment inside net pay. */
  loans: LoanLike[];
  onOpen: (salaryRecordId: string) => void;
}

export function SalaryTab({ records, loans, onOpen }: SalaryTabProps) {
  const [name, setName] = useState<string | null>(null);
  const [period, setPeriod] = useState<string | null>(null);

  const names = distinct(records, (record) => record.person?.full_name);
  const periods = distinct(records, (record) => record.period);

  const visible = records.filter(
    (record) =>
      (name === null || record.person?.full_name === name) &&
      (period === null || record.period === period),
  );

  const unpaid = visible.filter((record) => !record.paid);
  const paid = visible.filter((record) => record.paid);

  const card = (record: SalaryRecord) => (
    <Pressable
      key={record.id}
      accessibilityRole="button"
      onPress={() => onOpen(record.id)}
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={type.code}>{record.period}</Text>
        <StatusPill
          status={record.paid ? 'completed' : 'draft'}
          label={record.paid ? 'Paid' : 'Unpaid'}
        />
      </View>

      <View style={styles.body}>
        <Text style={[type.bodyStrong, styles.text]} numberOfLines={1}>
          {record.person?.full_name ?? 'Unknown worker'}
        </Text>
        <Text style={[type.code, styles.amount]}>
          {formatRs(netPayFor(record, loans))}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FilterChips label="Filter by name" values={names} value={name} onChange={setName} />
      <FilterChips
        label="Filter by period"
        values={periods}
        value={period}
        onChange={setPeriod}
      />

      <Text style={type.heading}>Unpaid</Text>
      {unpaid.length === 0 ? (
        <EmptyState icon="inbox" title="Nothing outstanding" />
      ) : (
        unpaid.map(card)
      )}

      <Text style={[type.heading, styles.sectionGap]}>Paid</Text>
      {paid.length === 0 ? <EmptyState icon="inbox" title="Nothing paid yet" /> : paid.map(card)}
    </View>
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
  sectionGap: {
    marginTop: spacing.tight,
  },
});
