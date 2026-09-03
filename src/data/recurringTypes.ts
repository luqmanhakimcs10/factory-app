/** How often an expense repeats. `none` is a one-off. */
export const RECURRING_TYPES = ['none', 'weekly', 'monthly', 'yearly'] as const;

export type RecurringType = (typeof RECURRING_TYPES)[number];

export const RECURRING_LABELS: Record<RecurringType, string> = {
  none: 'One-off',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export function recurringLabel(value: string): string {
  return RECURRING_LABELS[value as RecurringType] ?? value;
}
