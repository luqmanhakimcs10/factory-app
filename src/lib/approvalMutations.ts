import { supabase } from '../data/supabase';
import type { RejectReason } from '../data/rejectReasons';

/**
 * Approve / reject an expense or a loan.
 *
 * The database exposes four typed RPCs rather than one that takes a table name
 * — a generic version would have to assemble SQL from a caller-supplied string,
 * and there are exactly two tables. The asymmetry stops here: screens call
 * `approveRecord` / `rejectRecord` and never learn which RPC ran.
 *
 * Every one of these is `security definer` and re-checks that the caller is a
 * `company_admin` server-side. Hiding the buttons is presentation; this is the
 * actual control.
 */
export type ApprovableType = 'expense' | 'loan';

const APPROVE_RPC: Record<ApprovableType, string> = {
  expense: 'approve_expense',
  loan: 'approve_loan',
};

const REJECT_RPC: Record<ApprovableType, string> = {
  expense: 'reject_expense',
  loan: 'reject_loan',
};

/** The RPCs name their id argument after their own table. */
const ID_ARG: Record<ApprovableType, string> = {
  expense: 'p_expense_id',
  loan: 'p_loan_id',
};

export async function approveRecord(type: ApprovableType, id: string): Promise<void> {
  const { error } = await supabase.rpc(APPROVE_RPC[type], { [ID_ARG[type]]: id });
  if (error) throw error;
}

export async function rejectRecord(
  type: ApprovableType,
  id: string,
  reason: RejectReason,
): Promise<void> {
  const { error } = await supabase.rpc(REJECT_RPC[type], {
    [ID_ARG[type]]: id,
    p_reason: reason,
  });
  if (error) throw error;
}
