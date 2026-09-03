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
import { formatRs } from '../../lib/ledgerMath';
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
  clientCount: number;
  employeeCount: number;
}

async function countRows(table: string, factoryId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('factory_id', factoryId);

  if (error) throw error;
  return count ?? 0;
}

export async function getAdminSummary(factoryId: string): Promise<AdminSummary> {
  const [approvals, clientCount, employeeCount] = await Promise.all([
    listApprovals(factoryId),
    countRows('clients', factoryId),
    countRows('employees', factoryId),
  ]);

  return {
    pending: approvals.filter((item) => item.status === 'pending'),
    clientCount,
    employeeCount,
  };
}
