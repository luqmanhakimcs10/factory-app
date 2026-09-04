import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { uuid } from '../../data/types';
import { expenseCategoryLabel } from '../../data/expenseCategories';
import { recurringLabel } from '../../data/recurringTypes';
import {
  APPROVAL_STATUSES,
  REJECT_REASONS,
  type ApprovalStatus,
  type RejectReason,
} from '../../data/rejectReasons';
import {
  currentMonthLabel,
  currentMonthStartIso,
  currentMonthStats,
  currentPeriod,
  formatRs,
  isThisMonth,
  type CurrentMonthStats,
} from '../../lib/ledgerMath';
import type { ApprovableType } from '../../lib/approvalMutations';

/**
 * Reads for the Company Admin module.
 *
 * Every read here is a plain select. This role has no update grant on
 * `expenses` or `loans` at all — `0010_company_admin.sql` deliberately gave it
 * none, because the only sanctioned way to move `status` is the four
 * security-definer RPCs behind `lib/approvalMutations.ts`. So this file reads,
 * that file writes, and there is no third path.
 *
 * The two approvables are normalised into one `ApprovalItem` on the way out.
 * An expense and a loan are different records, but the decision being made
 * about them is the same decision, and an inbox that renders two shapes ends up
 * with two sets of rules for one queue.
 */

// --- Expenses ---------------------------------------------------------------

const expenseSchema = z.object({
  id: uuid(),
  category: z.string(),
  other_name: z.string().nullable(),
  amount: z.number(),
  description: z.string().nullable(),
  recurring_type: z.string(),
  status: z.enum(APPROVAL_STATUSES),
  reject_reason: z.enum(REJECT_REASONS).nullable(),
  submitted_at: z.string(),
  reviewed_at: z.string().nullable(),
});

export type ExpenseRecord = z.infer<typeof expenseSchema>;

const EXPENSE_SELECT =
  'id, category, other_name, amount, description, recurring_type, status, reject_reason, submitted_at, reviewed_at';

/** The submitter's own name for the expense wins over the category label. */
export function expenseTitle(expense: ExpenseRecord): string {
  return expense.other_name?.trim()
    ? expense.other_name
    : expenseCategoryLabel(expense.category);
}

export async function getExpenseForReview(id: string): Promise<ExpenseRecord> {
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_SELECT)
    .eq('id', id)
    .single();

  if (error) throw error;
  return expenseSchema.parse(data);
}

// --- Loans ------------------------------------------------------------------

const loanSchema = z.object({
  id: uuid(),
  principal: z.number(),
  installment: z.number(),
  status: z.enum(APPROVAL_STATUSES),
  reject_reason: z.enum(REJECT_REASONS).nullable(),
  recorded_at: z.string(),
  worker: z.object({ full_name: z.string() }).nullable(),
});

type LoanRow = z.infer<typeof loanSchema>;

export interface LoanRecord {
  id: string;
  workerName: string;
  principal: number;
  installment: number;
  status: ApprovalStatus;
  rejectReason: RejectReason | null;
  recordedAt: string;
}

const LOAN_SELECT =
  'id, principal, installment, status, reject_reason, recorded_at, worker:worker_id(full_name)';

function toLoan(row: LoanRow): LoanRecord {
  return {
    id: row.id,
    workerName: row.worker?.full_name ?? 'Unknown worker',
    principal: row.principal,
    installment: row.installment,
    status: row.status,
    rejectReason: row.reject_reason,
    recordedAt: row.recorded_at,
  };
}

export async function getLoanForReview(id: string): Promise<LoanRecord> {
  const { data, error } = await supabase
    .from('loans')
    .select(LOAN_SELECT)
    .eq('id', id)
    .single();

  if (error) throw error;
  return toLoan(loanSchema.parse(data));
}

// --- The inbox --------------------------------------------------------------

/**
 * One row of the approvals queue, whichever table it came from.
 *
 * `kind` is what the detail screen and `approvalMutations` dispatch on, so it
 * is the same union `ApprovableType` uses rather than a parallel string.
 */
export interface ApprovalItem {
  kind: ApprovableType;
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  raisedAt: string;
  status: ApprovalStatus;
  rejectReason: RejectReason | null;
}

function expenseItem(expense: ExpenseRecord): ApprovalItem {
  const recurring =
    expense.recurring_type === 'none'
      ? ''
      : ` — repeats ${recurringLabel(expense.recurring_type).toLowerCase()}`;

  return {
    kind: 'expense',
    id: expense.id,
    title: expenseTitle(expense),
    subtitle: `${expenseCategoryLabel(expense.category)}${recurring}`,
    amount: expense.amount,
    raisedAt: expense.submitted_at,
    status: expense.status,
    rejectReason: expense.reject_reason,
  };
}

function loanItem(loan: LoanRecord): ApprovalItem {
  return {
    kind: 'loan',
    id: loan.id,
    title: loan.workerName,
    subtitle: `Loan — ${formatRs(loan.installment)} per instalment`,
    amount: loan.principal,
    raisedAt: loan.recordedAt,
    status: loan.status,
    rejectReason: loan.rejectReason,
  };
}

/**
 * Every expense and loan in the factory, newest first, as one queue.
 *
 * Fetched whole rather than filtered to `pending` server-side: the inbox shows
 * decided records too, and a factory's expense and loan tables are small enough
 * that two round trips beat four.
 */
export async function listApprovals(factoryId: string): Promise<ApprovalItem[]> {
  const [expenses, loans] = await Promise.all([
    supabase
      .from('expenses')
      .select(EXPENSE_SELECT)
      .eq('factory_id', factoryId)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('loans')
      .select(LOAN_SELECT)
      .eq('factory_id', factoryId)
      .order('recorded_at', { ascending: false }),
  ]);

  if (expenses.error) throw expenses.error;
  if (loans.error) throw loans.error;

  return [
    ...z.array(expenseSchema).parse(expenses.data).map(expenseItem),
    ...z.array(loanSchema).parse(loans.data).map(toLoan).map(loanItem),
  ].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
}

// --- Dashboard --------------------------------------------------------------

export interface AdminSummary {
  pending: ApprovalItem[];
  /** Live profit and loss for the current month. */
  pnl: CurrentMonthStats;
  monthLabel: string;
  bonusSlabCount: number;
  employeeCount: number;
  finishingPartnerCount: number;
  supplierCount: number;
  clientCount: number;
}

/**
 * How many rows a factory has in one of the master-data rosters.
 *
 * `head: true` asks PostgREST for the count header and no body, so a roster of
 * any size costs the same as an empty one.
 */
async function countRows(
  table: string,
  factoryId: string,
  activeOnly = true,
): Promise<number> {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('factory_id', factoryId);

  // The dashboard counts people and companies the factory currently works
  // with. An inactive supplier is history, not a roster entry, and counting it
  // would make the card disagree with the list it opens.
  if (activeOnly) query = query.eq('status', 'active');

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * The current month's profit and loss, recomputed from live rows.
 *
 * A read-only mirror of what the Accountant's Stats tab shows, through the same
 * `currentMonthStats` in `lib/ledgerMath.ts`. `monthly_history` is deliberately
 * not consulted: that table holds closed months, and this one is open.
 *
 * `invoice_payments` and `po_payments` carry no `factory_id` of their own, so
 * both are scoped through an inner join on their parent — the same boundary
 * every RLS policy on those tables uses.
 */
async function getCurrentMonthPnl(factoryId: string): Promise<CurrentMonthStats> {
  const since = currentMonthStartIso();

  const [invoicePayments, billPayments, salaries, loans, expenses] =
    await Promise.all([
      supabase
        .from('invoice_payments')
        .select('amount, paid_at, orders!inner(factory_id)')
        .eq('orders.factory_id', factoryId)
        .gte('paid_at', since),
      supabase
        .from('po_payments')
        .select('amount, paid_at, purchase_orders!inner(factory_id)')
        .eq('purchase_orders.factory_id', factoryId)
        .gte('paid_at', since),
      supabase
        .from('salary_records')
        .select('person_id, base_pay, bonus, damage_deduction, leave_deduction')
        .eq('factory_id', factoryId)
        .eq('period', currentPeriod())
        .eq('paid', true),
      supabase
        .from('loans')
        .select('id, worker_id, principal, installment, status, loan_history(amount)')
        .eq('factory_id', factoryId),
      supabase
        .from('expenses')
        .select('amount, submitted_at')
        .eq('factory_id', factoryId)
        .eq('status', 'approved')
        .gte('submitted_at', since),
    ]);

  for (const result of [invoicePayments, billPayments, salaries, loans, expenses]) {
    if (result.error) throw result.error;
  }

  const money = z.object({ amount: z.number() });
  const dated = z.object({ amount: z.number(), paid_at: z.string() });

  return currentMonthStats({
    // `since` is a UTC instant while `isThisMonth` reads the local calendar, so
    // the boundary rows the filter lets through are re-checked here rather than
    // trusted — the two disagree for a few hours either side of the 1st.
    invoicePayments: z
      .array(dated)
      .parse(invoicePayments.data)
      .filter((row) => isThisMonth(row.paid_at)),
    billPayments: z
      .array(dated)
      .parse(billPayments.data)
      .filter((row) => isThisMonth(row.paid_at)),
    paidSalaries: z
      .array(
        z.object({
          person_id: uuid(),
          base_pay: z.number(),
          bonus: z.number(),
          damage_deduction: z.number(),
          leave_deduction: z.number(),
        }),
      )
      .parse(salaries.data),
    loans: z
      .array(
        z.object({
          id: uuid(),
          worker_id: uuid(),
          principal: z.number(),
          installment: z.number(),
          status: z.enum(APPROVAL_STATUSES),
          loan_history: z.array(money),
        }),
      )
      .parse(loans.data)
      .map((row) => ({ ...row, history: row.loan_history })),
    approvedExpenses: z
      .array(z.object({ amount: z.number(), submitted_at: z.string() }))
      .parse(expenses.data)
      .filter((row) => isThisMonth(row.submitted_at)),
  });
}

export async function getAdminSummary(factoryId: string): Promise<AdminSummary> {
  const [
    approvals,
    pnl,
    bonusSlabCount,
    employeeCount,
    finishingPartnerCount,
    supplierCount,
    clientCount,
  ] = await Promise.all([
    listApprovals(factoryId),
    getCurrentMonthPnl(factoryId),
    // `bonus_slabs` has no status column — a slab is either configured or it
    // does not exist, so every row counts.
    countRows('bonus_slabs', factoryId, false),
    countRows('employees', factoryId),
    countRows('finishing_partners', factoryId),
    countRows('suppliers', factoryId),
    countRows('clients', factoryId),
  ]);

  return {
    pending: approvals.filter((item) => item.status === 'pending'),
    pnl,
    monthLabel: currentMonthLabel(),
    bonusSlabCount,
    employeeCount,
    finishingPartnerCount,
    supplierCount,
    clientCount,
  };
}
