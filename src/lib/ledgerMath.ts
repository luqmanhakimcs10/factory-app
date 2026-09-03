import type { ApprovalStatus } from '../data/rejectReasons';
import type { Billing, NeedleEntry } from '../data/types';

/**
 * Every money figure in the Accountant module.
 *
 * Pure functions, defined once. No screen recomputes `netPay` or `remaining`
 * inline — a second copy of one of these is how two screens end up disagreeing
 * about what a worker is owed.
 *
 * The payment RPCs in `0009_accountant.sql` mirror the invoice and bill maths
 * in SQL. That duplication is deliberate: the server is the boundary, the
 * client is the display.
 */

// --- Currency ---------------------------------------------------------------

/** "Rs." with no decimals, per the source mockup. */
export function formatRs(amount: number): string {
  const rounded = Math.round(amount);
  return `Rs. ${rounded.toLocaleString()}`;
}

// --- Invoices ---------------------------------------------------------------

export interface InvoiceSheet {
  repeats: number;
}

export interface InvoiceLike {
  sheets: InvoiceSheet[];
  needles: NeedleEntry[];
  billing: Billing | null;
  damagedRepeatsPrice: number;
  payments: { amount: number }[];
}

export function totalRepeats(invoice: Pick<InvoiceLike, 'sheets'>): number {
  return invoice.sheets.reduce((sum, sheet) => sum + sheet.repeats, 0);
}

export function perRepeatStitches(needles: NeedleEntry[]): number {
  return needles.reduce((sum, entry) => sum + entry.stitches, 0);
}

/** Zero when no billing mode or rate has been set on the order. */
export function totalBillFor(invoice: InvoiceLike): number {
  if (!invoice.billing) return 0;

  const repeats = totalRepeats(invoice);

  if (invoice.billing.mode === 'repeat') {
    return repeats * (invoice.billing.repeat_price ?? 0);
  }

  return Math.round(
    ((perRepeatStitches(invoice.needles) * repeats) / 1000) *
      (invoice.billing.stitch_rate_per_1000 ?? 0),
  );
}

export function amountPaidFor(row: { payments: { amount: number }[] }): number {
  return row.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

export function remainingFor(invoice: InvoiceLike): number {
  return totalBillFor(invoice) - invoice.damagedRepeatsPrice - amountPaidFor(invoice);
}

/** A short description of how the total was arrived at, for the sub-label. */
export function billingModeLabel(billing: Billing | null): string {
  if (!billing) return 'No billing rate set';
  return billing.mode === 'repeat'
    ? `Per Repeat · ${formatRs(billing.repeat_price ?? 0)} each`
    : `Per Stitch · ${formatRs(billing.stitch_rate_per_1000 ?? 0)} per 1,000`;
}

// --- Supplier bills ---------------------------------------------------------

export interface BillLike {
  items: { price: number }[];
  payments: { amount: number }[];
}

export function totalBillForBill(bill: BillLike): number {
  return bill.items.reduce((sum, item) => sum + item.price, 0);
}

export function remainingPayableFor(bill: BillLike): number {
  return totalBillForBill(bill) - amountPaidFor(bill);
}

// --- Loans ------------------------------------------------------------------

export interface LoanLike {
  id: string;
  worker_id: string;
  principal: number;
  installment: number;
  status: ApprovalStatus;
  history: { amount: number }[];
}

export function balanceForLoan(loan: LoanLike): number {
  return loan.principal - loan.history.reduce((sum, entry) => sum + entry.amount, 0);
}

/** The active approved loan for a person, if any. */
export function activeLoanFor(personId: string, loans: LoanLike[]): LoanLike | null {
  return (
    loans.find(
      (loan) =>
        loan.worker_id === personId &&
        loan.status === 'approved' &&
        balanceForLoan(loan) > 0,
    ) ?? null
  );
}

export function loanInstallmentFor(personId: string, loans: LoanLike[]): number {
  const loan = activeLoanFor(personId, loans);
  if (!loan) return 0;
  // Never take more than is still owed on the final installment.
  return Math.min(loan.installment, balanceForLoan(loan));
}

// --- Payroll ----------------------------------------------------------------

export interface SalaryLike {
  person_id: string;
  base_pay: number;
  bonus: number;
  damage_deduction: number;
  leave_deduction: number;
}

export function netPayFor(worker: SalaryLike, loans: LoanLike[]): number {
  return (
    worker.base_pay +
    worker.bonus -
    worker.damage_deduction -
    worker.leave_deduction -
    loanInstallmentFor(worker.person_id, loans)
  );
}

// --- Monthly history --------------------------------------------------------

export interface MonthLike {
  month_label: string;
  income: number;
  payables: number;
  salary: number;
  expenses_by_category: Record<string, number>;
}

export function monthExpensesByCategoryTotal(month: MonthLike): number {
  return Object.values(month.expenses_by_category).reduce(
    (sum, value) => sum + (value ?? 0),
    0,
  );
}

export function totalExpensesFor(month: MonthLike): number {
  return month.payables + month.salary + monthExpensesByCategoryTotal(month);
}

export function netFor(month: MonthLike): number {
  return month.income - totalExpensesFor(month);
}

// --- Current month, live ----------------------------------------------------

/**
 * "So far this month", recomputed from real rows every time.
 *
 * Never read from `monthly_history` — that table is for closed months, and the
 * current one is not closed.
 *
 * Loans are absent from every figure here on purpose: a disbursement or a
 * repayment is its own ledger, not profit and loss. Do not fold loan cash flow
 * into any of these totals.
 */
export interface CurrentMonthInput {
  /** Invoice payments received this month. */
  invoicePayments: { amount: number }[];
  /** Supplier payments made this month. */
  billPayments: { amount: number }[];
  /** Salary records for this period that have actually been paid. */
  paidSalaries: SalaryLike[];
  loans: LoanLike[];
  /** Approved expenses submitted this month. */
  approvedExpenses: { amount: number }[];
}

export interface CurrentMonthStats {
  income: number;
  payables: number;
  salary: number;
  expensesTab: number;
  expenses: number;
  net: number;
}

export function currentMonthStats(input: CurrentMonthInput): CurrentMonthStats {
  const income = input.invoicePayments.reduce((sum, p) => sum + p.amount, 0);
  const payables = input.billPayments.reduce((sum, p) => sum + p.amount, 0);
  const salary = input.paidSalaries.reduce(
    (sum, record) => sum + netPayFor(record, input.loans),
    0,
  );
  const expensesTab = input.approvedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const expenses = payables + salary + expensesTab;

  return { income, payables, salary, expensesTab, expenses, net: income - expenses };
}

// --- Entry capping ----------------------------------------------------------

/**
 * Clamp a typed amount to what is actually outstanding.
 *
 * A convenience on the keypad, not a control: both payment RPCs reject an
 * overpayment server-side regardless of what reaches them.
 */
export function capToRemaining(entered: number, remaining: number): number {
  if (!Number.isFinite(entered) || entered < 0) return 0;
  return Math.min(entered, Math.max(0, remaining));
}
