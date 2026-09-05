import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import {
  EmptyState,
  FilterChips,
  StatusPill,
  approvalPill,
  distinct,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { expenseCategoryLabel } from '../../../data/expenseCategories';
import { recurringLabel } from '../../../data/recurringTypes';
import { approvalStatusLabel } from '../../../data/rejectReasons';
import { formatRs } from '../../../lib/ledgerMath';
import type { Expense } from '../api';

export interface ExpensesTabProps {
  expenses: Expense[];
  onAdd: () => void;
  onOpen: (expenseId: string) => void;
}

/** The display name of an expense: its own name if "Other", else the category. */
export function expenseTitle(expense: Expense): string {
  return expense.other_name?.trim()
    ? expense.other_name
    : expenseCategoryLabel(expense.category);
}

export function ExpensesTab({ expenses, onAdd, onOpen }: ExpensesTabProps) {
  const [category, setCategory] = useState<string | null>(null);
  const [recurring, setRecurring] = useState<string | null>(null);

  const categories = distinct(expenses, (expense) => expense.category);
  const recurrences = distinct(expenses, (expense) => expense.recurring_type);

  const visible = expenses.filter(
    (expense) =>
      (category === null || expense.category === category) &&
      (recurring === null || expense.recurring_type === recurring),
  );

  const pending = visible.filter((expense) => expense.status === 'pending');
  // "Reviewed", not "approved": a rejected expense has been dealt with and
  // belongs out of the pending queue, not hidden from the tab entirely.
  const reviewed = visible.filter((expense) => expense.status !== 'pending');

  const card = (expense: Expense) => (
    <Pressable
      key={expense.id}
      accessibilityRole="button"
      onPress={() => onOpen(expense.id)}
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {expenseTitle(expense)}
        </Text>
        <StatusPill
          status={approvalPill(expense.status)}
          label={approvalStatusLabel(expense.status)}
        />
      </View>

      <View style={styles.body}>
        <Text style={[type.label, styles.text]}>
          {expenseCategoryLabel(expense.category)}
          {expense.recurring_type !== 'none'
            ? ` · ${recurringLabel(expense.recurring_type)}`
            : ''}
        </Text>
        <Text style={[type.code, styles.amount]}>{formatRs(expense.amount)}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Pressable accessibilityRole="button" onPress={onAdd} style={styles.addButton}>
        <Feather name="plus" size={18} color={colors.primary} />
        <Text style={[type.bodyStrong, styles.addLabel]}>Add Expense</Text>
      </Pressable>

      <FilterChips
        label="Filter by category"
        values={categories}
        value={category}
        onChange={setCategory}
        format={expenseCategoryLabel}
      />
      <FilterChips
        label="Filter by recurring type"
        values={recurrences}
        value={recurring}
        onChange={setRecurring}
        format={recurringLabel}
      />

      <Text style={type.heading}>Pending Approval</Text>
      {pending.length === 0 ? (
        <EmptyState icon="inbox" title="Nothing awaiting approval" />
      ) : (
        pending.map(card)
      )}

      <Text style={[type.heading, styles.sectionGap]}>Reviewed</Text>
      {reviewed.length === 0 ? (
        <EmptyState icon="inbox" title="Nothing reviewed yet" />
      ) : (
        reviewed.map(card)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.tight + 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight,
    paddingVertical: spacing.content - 2,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  addLabel: {
    color: colors.primary,
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
