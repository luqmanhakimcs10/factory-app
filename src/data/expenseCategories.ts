/** The eight expense categories, in the order the chip row shows them. */
export const EXPENSE_CATEGORIES = [
  'water',
  'internet',
  'electric',
  'machine_repair',
  'food',
  'marketing',
  'maintenance',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  water: 'Water',
  internet: 'Internet',
  electric: 'Electric',
  machine_repair: 'Machine Repair',
  food: 'Food',
  marketing: 'Marketing',
  maintenance: 'Maintenance',
  other: 'Other',
};

export function expenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category;
}
