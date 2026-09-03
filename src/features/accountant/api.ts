import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import {
  uuid,
  billingSchema,
  needleEntrySchema,
  poSourceSchema,
  type Billing,
  type NeedleEntry,
} from '../../data/types';
import type { ExpenseCategory } from '../../data/expenseCategories';
import type { RecurringType } from '../../data/recurringTypes';
import {
  APPROVAL_STATUSES,
  REJECT_REASONS,
  type RejectReason,
} from '../../data/rejectReasons';
import type { InvoiceLike, LoanLike } from '../../lib/ledgerMath';

/**
 * Reads and writes for the Accountant module.
 *
 * Every write here goes through an RPC. This role has no update grant on
 * `orders`, no insert on the payment ledgers, and no write of any kind on
 * `loans` — see `0009_accountant.sql`. That is the boundary; this file only
 * calls through it.
 */

const paymentSchema = z.object({
  id: uuid(),
  amount: z.number(),
  paid_at: z.string(),
  photo_url: z.string(),
  recorder: z.object({ full_name: z.string() }).nullable(),
});

export type Payment = z.infer<typeof paymentSchema>;

// --- Receivables ------------------------------------------------------------

const invoiceSchema = z.object({
  id: uuid(),
  code: z.string(),
  design_code: z.string().nullable(),
  billing: billingSchema.nullable(),
  needles: z.array(needleEntrySchema).nullable(),
  damaged_repeats_price: z.number().nullable(),
  created_at: z.string(),
  clients: z.object({ name: z.string() }).nullable(),
  order_sheets: z.array(
    z.object({
      id: uuid(),
      color_id: z.string(),
      custom_hex: z.string().nullable(),
      repeats: z.number().int().positive(),
      stage: z.string().nullable(),
    }),
  ),
  invoice_payments: z.array(paymentSchema),
});

type InvoiceRow = z.infer<typeof invoiceSchema>;

export interface Invoice extends InvoiceLike {
  id: string;
  code: string;
  clientName: string;
  designCode: string | null;
  createdAt: string;
  sheetRows: { id: string; colorId: string; customHex: string | null; repeats: number }[];
  paymentRows: Payment[];
}

const INVOICE_SELECT =
  'id, code, design_code, billing, needles, damaged_repeats_price, created_at, clients(name), order_sheets(id, color_id, custom_hex, repeats, stage), invoice_payments(id, amount, paid_at, photo_url, recorder:recorded_by(full_name))';

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    code: row.code,
    clientName: row.clients?.name ?? 'Unknown client',
    designCode: row.design_code,
    createdAt: row.created_at,
    sheets: row.order_sheets.map((sheet) => ({ repeats: sheet.repeats })),
    sheetRows: row.order_sheets.map((sheet) => ({
      id: sheet.id,
      colorId: sheet.color_id,
      customHex: sheet.custom_hex,
      repeats: sheet.repeats,
    })),
    needles: (row.needles ?? []) as NeedleEntry[],
    billing: (row.billing ?? null) as Billing | null,
    damagedRepeatsPrice: row.damaged_repeats_price ?? 0,
    payments: row.invoice_payments.map((payment) => ({ amount: payment.amount })),
    paymentRows: row.invoice_payments,
  };
}

/**
 * An order becomes an invoice once every sheet on it is `ready` — the same
 * condition that makes the Floor Manager's own Invoice card appear. Neither
 * `stage` nor `floor_status` has a single value meaning "invoiceable", so the
 * check is on the sheets.
 */
function isInvoiceable(row: InvoiceRow): boolean {
  return (
    row.order_sheets.length > 0 &&
    row.order_sheets.every((sheet) => sheet.stage === 'ready')
  );
}

export async function listInvoices(factoryId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(INVOICE_SELECT)
    .eq('factory_id', factoryId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return z.array(invoiceSchema).parse(data).filter(isInvoiceable).map(toInvoice);
}

export async function getInvoice(orderId: string): Promise<Invoice> {
  const { data, error } = await supabase
    .from('orders')
    .select(INVOICE_SELECT)
    .eq('id', orderId)
    .single();

  if (error) throw error;
  return toInvoice(invoiceSchema.parse(data));
}

// --- Payables ---------------------------------------------------------------

const billSchema = z.object({
  id: uuid(),
  po_number: z.string(),
  source: poSourceSchema,
  supplier_name: z.string().nullable(),
  date: z.string(),
  po_items: z.array(
    z.object({
      id: uuid(),
      qty: z.number(),
      price: z.number(),
      stock_items: z
        .object({
          type: z.enum(['thread', 'tilla', 'sequin', 'bobbin']),
          label: z.string(),
          color_id: z.string().nullable(),
          custom_hex: z.string().nullable(),
        })
        .nullable(),
    }),
  ),
  po_payments: z.array(paymentSchema),
});

type BillRow = z.infer<typeof billSchema>;

export interface BillItem {
  id: string;
  label: string;
  quantity: string;
  price: number;
  colorId: string | null;
  hex: string | null;
}

export interface Bill {
  id: string;
  poNumber: string;
  supplierName: string | null;
  source: 'manual' | 'system_generated';
  date: string;
  itemRows: BillItem[];
  items: { price: number }[];
  payments: { amount: number }[];
  paymentRows: Payment[];
}

const BILL_SELECT =
  'id, po_number, source, supplier_name, date, po_items(id, qty, price, stock_items(type, label, color_id, custom_hex)), po_payments(id, amount, paid_at, photo_url, recorder:recorded_by(full_name))';

/** Line labels and units differ by stock type. */
function describeItem(item: BillRow['po_items'][number]): BillItem {
  const stock = item.stock_items;
  const type = stock?.type ?? 'thread';
  const name = stock?.label ?? 'Item';

  const label =
    type === 'tilla'
      ? `Tilla · ${name}`
      : type === 'bobbin'
        ? 'Bobbin Thread'
        : type === 'sequin'
          ? `Sequin · ${name}`
          : name;

  const quantity =
    type === 'bobbin' ? `${item.qty} pcs` : `${item.qty.toLocaleString()} g`;

  return {
    id: item.id,
    label,
    quantity,
    price: item.price,
    colorId: type === 'tilla' ? null : (stock?.color_id ?? null),
    hex: stock?.custom_hex ?? null,
  };
}

function toBill(row: BillRow): Bill {
  const itemRows = row.po_items.map(describeItem);
  return {
    id: row.id,
    poNumber: row.po_number,
    supplierName: row.supplier_name,
    source: row.source,
    date: row.date,
    itemRows,
    items: itemRows.map((item) => ({ price: item.price })),
    payments: row.po_payments.map((payment) => ({ amount: payment.amount })),
    paymentRows: row.po_payments,
  };
}

/**
 * Confirmed purchase orders only.
 *
 * The filter is also a RESTRICTIVE policy on the table, so an unconfirmed PO is
 * unreadable to this role even by id — this `eq` is the query being honest
 * about what it wants, not the thing enforcing it.
 */
export async function listBills(factoryId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(BILL_SELECT)
    .eq('factory_id', factoryId)
    .eq('status', 'confirmed')
    .order('date', { ascending: false });

  if (error) throw error;
  return z.array(billSchema).parse(data).map(toBill);
}

export async function getBill(purchaseOrderId: string): Promise<Bill> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(BILL_SELECT)
    .eq('id', purchaseOrderId)
    .single();

  if (error) throw error;
  return toBill(billSchema.parse(data));
}

// --- Payroll and loans ------------------------------------------------------

const salarySchema = z.object({
  id: uuid(),
  person_id: uuid(),
  period: z.string(),
  base_pay: z.number(),
  bonus: z.number(),
  damage_deduction: z.number(),
  damage_stage: z.string().nullable(),
  leave_deduction: z.number(),
  paid: z.boolean(),
  paid_at: z.string().nullable(),
  person: z.object({ full_name: z.string() }).nullable(),
  approver: z.object({ full_name: z.string() }).nullable(),
});

export type SalaryRecord = z.infer<typeof salarySchema>;

const SALARY_SELECT =
  'id, person_id, period, base_pay, bonus, damage_deduction, damage_stage, leave_deduction, paid, paid_at, person:person_id(full_name), approver:leave_approved_by(full_name)';

export async function listSalaryRecords(factoryId: string): Promise<SalaryRecord[]> {
  const { data, error } = await supabase
    .from('salary_records')
    .select(SALARY_SELECT)
    .eq('factory_id', factoryId)
    .order('period', { ascending: false });

  if (error) throw error;
  return z.array(salarySchema).parse(data);
}

export async function getSalaryRecord(id: string): Promise<SalaryRecord> {
  const { data, error } = await supabase
    .from('salary_records')
    .select(SALARY_SELECT)
    .eq('id', id)
    .single();

  if (error) throw error;
  return salarySchema.parse(data);
}

const loanSchema = z.object({
  id: uuid(),
  worker_id: uuid(),
  principal: z.number(),
  installment: z.number(),
  status: z.enum(APPROVAL_STATUSES),
  reject_reason: z.enum(REJECT_REASONS).nullable(),
  recorded_at: z.string(),
  worker: z.object({ full_name: z.string() }).nullable(),
  loan_history: z.array(
    z.object({ id: uuid(), period: z.string(), amount: z.number(), paid_at: z.string() }),
  ),
});

type LoanRow = z.infer<typeof loanSchema>;

export interface Loan extends LoanLike {
  rejectReason: RejectReason | null;
  workerName: string;
  recordedAt: string;
  historyRows: { id: string; period: string; amount: number; paid_at: string }[];
}

const LOAN_SELECT =
  'id, worker_id, principal, installment, status, reject_reason, recorded_at, worker:worker_id(full_name), loan_history(id, period, amount, paid_at)';

function toLoan(row: LoanRow): Loan {
  return {
    id: row.id,
    worker_id: row.worker_id,
    principal: row.principal,
    installment: row.installment,
    status: row.status,
    rejectReason: row.reject_reason,
    history: row.loan_history.map((entry) => ({ amount: entry.amount })),
    historyRows: row.loan_history,
    workerName: row.worker?.full_name ?? 'Unknown worker',
    recordedAt: row.recorded_at,
  };
}

export async function listLoans(factoryId: string): Promise<Loan[]> {
  const { data, error } = await supabase
    .from('loans')
    .select(LOAN_SELECT)
    .eq('factory_id', factoryId)
    .order('recorded_at', { ascending: false });

  if (error) throw error;
  return z.array(loanSchema).parse(data).map(toLoan);
}

export async function getLoan(id: string): Promise<Loan> {
  const { data, error } = await supabase
    .from('loans')
    .select(LOAN_SELECT)
    .eq('id', id)
    .single();

  if (error) throw error;
  return toLoan(loanSchema.parse(data));
}

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

export type Expense = z.infer<typeof expenseSchema>;

const EXPENSE_SELECT =
  'id, category, other_name, amount, description, recurring_type, status, reject_reason, submitted_at, reviewed_at';

export async function listExpenses(factoryId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_SELECT)
    .eq('factory_id', factoryId)
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return z.array(expenseSchema).parse(data);
}

export async function getExpense(id: string): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_SELECT)
    .eq('id', id)
    .single();

  if (error) throw error;
  return expenseSchema.parse(data);
}

// --- Monthly history --------------------------------------------------------

const monthSchema = z.object({
  id: uuid(),
  month_label: z.string(),
  income: z.number(),
  payables: z.number(),
  salary: z.number(),
  expenses_by_category: z.record(z.string(), z.number()),
});

export type MonthRow = z.infer<typeof monthSchema>;

/**
 * Closed months only. Nothing populates this table yet — the month-close job is
 * a separate design problem — so an empty Stats chart is expected, not a bug.
 */
export async function listMonthlyHistory(factoryId: string): Promise<MonthRow[]> {
  const { data, error } = await supabase
    .from('monthly_history')
    .select('id, month_label, income, payables, salary, expenses_by_category')
    .eq('factory_id', factoryId);

  if (error) throw error;
  return z.array(monthSchema).parse(data);
}

// --- Writes -----------------------------------------------------------------

async function uploadLedgerPhoto(
  factoryId: string,
  folder: string,
  uri: string,
  name: string,
): Promise<string> {
  return uploadPhoto({
    bucket: BUCKETS.ledgerPhotos,
    factoryId,
    folder,
    uri,
    name,
  });
}

export async function recordInvoicePayment(args: {
  factoryId: string;
  orderId: string;
  amount: number;
  photoUri: string;
}): Promise<void> {
  const photoUrl = await uploadLedgerPhoto(
    args.factoryId,
    `invoices/${args.orderId}`,
    args.photoUri,
    'payment',
  );

  // The server re-derives the remaining balance and rejects an overpayment;
  // the client-side cap is only there to stop the number being typed.
  const { error } = await supabase.rpc('record_invoice_payment', {
    p_order_id: args.orderId,
    p_amount: args.amount,
    p_photo_url: photoUrl,
  });
  if (error) throw error;
}

export async function payBill(args: {
  factoryId: string;
  purchaseOrderId: string;
  amount: number;
  photoUri: string;
}): Promise<void> {
  const photoUrl = await uploadLedgerPhoto(
    args.factoryId,
    `bills/${args.purchaseOrderId}`,
    args.photoUri,
    'payment',
  );

  const { error } = await supabase.rpc('pay_bill', {
    p_purchase_order_id: args.purchaseOrderId,
    p_amount: args.amount,
    p_photo_url: photoUrl,
  });
  if (error) throw error;
}

/**
 * Marks the salary paid and takes the loan installment in one transaction —
 * never two calls. A salary marked paid without its matching `loan_history`
 * row overpays the worker and corrupts the loan balance.
 */
export async function paySalary(args: {
  factoryId: string;
  salaryRecordId: string;
  photoUri: string;
}): Promise<void> {
  const photoUrl = await uploadLedgerPhoto(
    args.factoryId,
    `salary/${args.salaryRecordId}`,
    args.photoUri,
    'payment',
  );

  const { error } = await supabase.rpc('pay_salary', {
    p_salary_record_id: args.salaryRecordId,
    p_photo_url: photoUrl,
  });
  if (error) throw error;
}

export async function addExpense(args: {
  factoryId: string;
  profileId: string;
  category: ExpenseCategory;
  otherName: string | null;
  amount: number;
  description: string | null;
  recurringType: RecurringType;
  photoUri: string;
}): Promise<void> {
  const photoUrl = await uploadLedgerPhoto(
    args.factoryId,
    'expenses',
    args.photoUri,
    'receipt',
  );

  // Always raised pending. Approval is a different role's write.
  const { error } = await supabase.from('expenses').insert({
    factory_id: args.factoryId,
    category: args.category,
    other_name: args.otherName,
    amount: args.amount,
    description: args.description,
    recurring_type: args.recurringType,
    photo_url: photoUrl,
    status: 'pending',
    submitted_by: args.profileId,
  });
  if (error) throw error;
}
