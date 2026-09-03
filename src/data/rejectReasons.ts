/**
 * Approval vocabulary, shared by the Accountant's read-only views and Company
 * Admin's approve/reject flow.
 *
 * `pending` and `rejected` used to be the same value: a plain `approved =
 * false`. They are different facts — one is waiting on a decision, the other
 * has had one — and the Accountant's screens read them differently.
 */
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function approvalStatusLabel(value: string): string {
  return APPROVAL_STATUS_LABELS[value as ApprovalStatus] ?? value;
}

/** The four fixed reasons a company admin can refuse an expense or a loan. */
export const REJECT_REASONS = [
  'insufficient_proof',
  'amount_not_justified',
  'not_company_policy',
  'duplicate_or_error',
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  insufficient_proof: 'Insufficient proof',
  amount_not_justified: 'Amount not justified',
  not_company_policy: 'Not company policy',
  duplicate_or_error: 'Duplicate or error',
};

export function rejectReasonLabel(value: string): string {
  return REJECT_REASON_LABELS[value as RejectReason] ?? value;
}
