import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  EmptyState,
  FilterChips,
  StatusPill,
  distinct,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { balanceForLoan, formatRs } from '../../../lib/ledgerMath';
import type { Loan } from '../api';

export interface LoansTabProps {
  loans: Loan[];
  onOpen: (loanId: string) => void;
}

/**
 * Loans, read-only.
 *
 * There is no "Add Loan" entry point here and there must not be one: recording
 * and approving a loan belongs to another role. This tab and the detail screen
 * behind it only ever display.
 */
export function LoansTab({ loans, onOpen }: LoansTabProps) {
  const [name, setName] = useState<string | null>(null);

  // Only approved loans exist as far as this module is concerned, so the name
  // chips are built from those alone.
  const approved = loans.filter((loan) => loan.status === 'approved');
  const names = distinct(approved, (loan) => loan.workerName);

  const visible =
    name === null ? approved : approved.filter((loan) => loan.workerName === name);

  const active = visible.filter((loan) => balanceForLoan(loan) > 0);
  const paidOff = visible.filter((loan) => balanceForLoan(loan) <= 0);

  return (
    <View style={styles.container}>
      <FilterChips label="Filter by name" values={names} value={name} onChange={setName} />

      <Text style={type.heading}>Active Loans</Text>
      {active.length === 0 ? (
        <EmptyState icon="inbox" title="No active loans" />
      ) : (
        active.map((loan) => (
          <Pressable
            key={loan.id}
            accessibilityRole="button"
            onPress={() => onOpen(loan.id)}
            style={styles.card}
          >
            <View style={styles.header}>
              <Text style={type.bodyStrong} numberOfLines={1}>
                {loan.workerName}
              </Text>
              <StatusPill status="progress" label="Active" />
            </View>

            <View style={styles.figures}>
              <View style={styles.figure}>
                <Text style={type.caption}>TOTAL</Text>
                <Text style={[type.code, styles.amount]}>{formatRs(loan.principal)}</Text>
              </View>
              <View style={styles.figure}>
                <Text style={type.caption}>REMAINING</Text>
                <Text style={[type.code, styles.amount, styles.remaining]}>
                  {formatRs(balanceForLoan(loan))}
                </Text>
              </View>
            </View>

            <Text style={type.label}>{formatRs(loan.installment)} per period</Text>
          </Pressable>
        ))
      )}

      <Text style={[type.heading, styles.sectionGap]}>Paid Off</Text>
      {paidOff.length === 0 ? (
        <EmptyState icon="inbox" title="Nothing repaid yet" />
      ) : (
        paidOff.map((loan) => (
          <Pressable
            key={loan.id}
            accessibilityRole="button"
            onPress={() => onOpen(loan.id)}
            style={styles.card}
          >
            <View style={styles.header}>
              <Text style={type.bodyStrong} numberOfLines={1}>
                {loan.workerName}
              </Text>
              <StatusPill status="completed" label="Paid Off" />
            </View>
            <Text style={type.label}>Total paid {formatRs(loan.principal)}</Text>
          </Pressable>
        ))
      )}
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
    gap: spacing.tight,
  },
  figures: {
    flexDirection: 'row',
    gap: spacing.content * 2,
  },
  figure: {
    gap: 2,
  },
  amount: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  remaining: {
    color: colors.warning,
  },
  sectionGap: {
    marginTop: spacing.tight,
  },
});
