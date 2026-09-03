import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { uuid } from '../../data/types';
import { uploadPhoto, BUCKETS } from '../../data/storage';

/**
 * Platform console reads and writes.
 *
 * Every query here spans tenants on purpose. The only thing standing between
 * these calls and another factory's data is `auth_is_platform_admin()` in
 * `0011_super_admin.sql` — the tables are default-deny, so a factory employee
 * running this exact code gets empty results and failed writes.
 */

// --- Factories --------------------------------------------------------------

export const factorySchema = z.object({
  id: uuid(),
  name: z.string(),
  location: z.string().nullable(),
  responsible_person: z.string().nullable(),
  cnic_number: z.string().nullable(),
  cnic_photo_url: z.string().nullable(),
  phone_number: z.string().nullable(),
  employees_count: z.number().int().nullable(),
  subscription_fee: z.number().nullable(),
  starting_date: z.string().nullable(),
  due_date: z.string().nullable(),
  status: z.enum(['active', 'inactive']),
  created_at: z.string(),
});

export type Factory = z.infer<typeof factorySchema>;

const FACTORY_SELECT =
  'id, name, location, responsible_person, cnic_number, cnic_photo_url, phone_number, ' +
  'employees_count, subscription_fee, starting_date, due_date, status, created_at';

export async function listFactories(): Promise<Factory[]> {
  const { data, error } = await supabase
    .from('factories')
    .select(FACTORY_SELECT)
    .order('created_at');

  if (error) throw error;
  return z.array(factorySchema).parse(data);
}

export async function getFactory(factoryId: string): Promise<Factory> {
  const { data, error } = await supabase
    .from('factories')
    .select(FACTORY_SELECT)
    .eq('id', factoryId)
    .single();

  if (error) throw error;
  return factorySchema.parse(data);
}

export async function setFactoryStatus(
  factoryId: string,
  status: 'active' | 'inactive',
): Promise<void> {
  const { error } = await supabase.from('factories').update({ status }).eq('id', factoryId);
  if (error) throw error;
}

// --- Modules ----------------------------------------------------------------

const moduleSchema = z.object({ id: z.string(), label: z.string() });

export type PlatformModule = z.infer<typeof moduleSchema>;

export async function listModules(): Promise<PlatformModule[]> {
  const { data, error } = await supabase.from('modules').select('id, label').order('id');
  if (error) throw error;
  return z.array(moduleSchema).parse(data);
}

export async function listFactoryModules(factoryId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('factory_modules')
    .select('module_id')
    .eq('factory_id', factoryId)
    .eq('enabled', true);

  if (error) throw error;
  return z.array(z.object({ module_id: z.string() })).parse(data).map((r) => r.module_id);
}

/**
 * Replace a factory's module selection.
 *
 * Newly-unchecked modules are deleted rather than flipped to `enabled: false`.
 * No history requirement is stated anywhere, and one representation of "off"
 * beats two that can disagree.
 */
async function syncFactoryModules(factoryId: string, moduleIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from('factory_modules')
    .delete()
    .eq('factory_id', factoryId)
    .not('module_id', 'in', `(${moduleIds.map((id) => `"${id}"`).join(',') || '""'})`);
  if (deleteError) throw deleteError;

  if (moduleIds.length === 0) return;

  const { error: upsertError } = await supabase.from('factory_modules').upsert(
    moduleIds.map((moduleId) => ({
      factory_id: factoryId,
      module_id: moduleId,
      enabled: true,
    })),
    { onConflict: 'factory_id,module_id' },
  );
  if (upsertError) throw upsertError;
}

// --- Create / edit ----------------------------------------------------------

export interface FactoryDraft {
  name: string;
  location: string;
  responsiblePerson: string;
  cnicNumber: string;
  phoneNumber: string;
  employeesCount: number | null;
  subscriptionFee: number;
  /** Local URI from the picker; uploaded here. Null keeps the existing photo. */
  cnicPhotoUri: string | null;
  moduleIds: string[];
}

function addOneYear(from: Date): Date {
  const next = new Date(from);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}

/** `YYYY-MM-DD`, which is what a Postgres `date` column wants. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function createFactory(draft: FactoryDraft): Promise<string> {
  const today = new Date();

  // Inserted before the photo so the upload has a real factory id to file
  // under — the bucket is keyed `{factoryId}/{file}` like every other one.
  const { data, error } = await supabase
    .from('factories')
    .insert({
      name: draft.name,
      location: draft.location,
      responsible_person: draft.responsiblePerson,
      cnic_number: draft.cnicNumber,
      phone_number: draft.phoneNumber,
      employees_count: draft.employeesCount,
      subscription_fee: draft.subscriptionFee,
      starting_date: isoDate(today),
      due_date: isoDate(addOneYear(today)),
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw error;
  const factoryId = z.object({ id: uuid() }).parse(data).id;

  if (draft.cnicPhotoUri) {
    await attachCnicPhoto(factoryId, draft.cnicPhotoUri);
  }
  await syncFactoryModules(factoryId, draft.moduleIds);

  return factoryId;
}

/**
 * Overwrite every editable field.
 *
 * Deliberately does not touch `status`, `starting_date`, `due_date` or any
 * payment: each of those moves only through its own action.
 */
export async function updateFactory(factoryId: string, draft: FactoryDraft): Promise<void> {
  const { error } = await supabase
    .from('factories')
    .update({
      name: draft.name,
      location: draft.location,
      responsible_person: draft.responsiblePerson,
      cnic_number: draft.cnicNumber,
      phone_number: draft.phoneNumber,
      employees_count: draft.employeesCount,
      subscription_fee: draft.subscriptionFee,
    })
    .eq('id', factoryId);
  if (error) throw error;

  if (draft.cnicPhotoUri) {
    await attachCnicPhoto(factoryId, draft.cnicPhotoUri);
  }
  await syncFactoryModules(factoryId, draft.moduleIds);
}

async function attachCnicPhoto(factoryId: string, uri: string): Promise<void> {
  const path = await uploadPhoto({
    bucket: BUCKETS.factoryDocs,
    factoryId,
    uri,
    name: 'cnic',
  });

  const { error } = await supabase
    .from('factories')
    .update({ cnic_photo_url: path })
    .eq('id', factoryId);
  if (error) throw error;
}

// --- Subscription payments --------------------------------------------------

const paymentSchema = z.object({
  id: uuid(),
  factory_id: uuid(),
  amount: z.number(),
  description: z.string(),
  due_date: z.string().nullable(),
  paid_date: z.string().nullable(),
  status: z.enum(['paid', 'pending']),
  created_at: z.string(),
});

export type SubscriptionPayment = z.infer<typeof paymentSchema>;

const PAYMENT_SELECT =
  'id, factory_id, amount, description, due_date, paid_date, status, created_at';

export async function listPayments(factoryId: string): Promise<SubscriptionPayment[]> {
  const { data, error } = await supabase
    .from('subscription_payments')
    .select(PAYMENT_SELECT)
    .eq('factory_id', factoryId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return z.array(paymentSchema).parse(data);
}

export async function listAllPayments(): Promise<SubscriptionPayment[]> {
  const { data, error } = await supabase.from('subscription_payments').select(PAYMENT_SELECT);
  if (error) throw error;
  return z.array(paymentSchema).parse(data);
}

export async function generateInvoice(args: {
  factoryId: string;
  amount: number;
  description: string;
  dueDate: string;
}): Promise<void> {
  const { error } = await supabase.from('subscription_payments').insert({
    factory_id: args.factoryId,
    amount: args.amount,
    description: args.description.trim() || 'Invoice',
    due_date: args.dueDate,
    paid_date: null,
    status: 'pending',
  });
  if (error) throw error;
}

/**
 * Flip a payment between paid and pending.
 *
 * `paid_date` is written on the way to `paid` and cleared on the way back, so
 * it never claims a settlement date for an outstanding invoice. `due_date` is
 * never touched — it is what the invoice was issued against.
 */
export async function setPaymentStatus(
  paymentId: string,
  status: 'paid' | 'pending',
): Promise<void> {
  const { error } = await supabase
    .from('subscription_payments')
    .update({
      status,
      paid_date: status === 'paid' ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq('id', paymentId);
  if (error) throw error;
}

// --- Derived figures --------------------------------------------------------

export interface DashboardStats {
  totalFactories: number;
  activeFactories: number;
  monthlyRevenue: number;
  pastDues: number;
}

/**
 * All four recomputed on every render, never stored.
 *
 * `pastDues` sums outstanding invoices across every tenant, which is the same
 * basis `totalReceivableFor` uses per factory — one definition of "owed", so
 * the dashboard total and a factory's own figure cannot drift apart.
 */
export function dashboardStats(
  factories: Factory[],
  payments: SubscriptionPayment[],
): DashboardStats {
  return {
    totalFactories: factories.length,
    activeFactories: factories.filter((f) => f.status === 'active').length,
    monthlyRevenue: factories.reduce((sum, f) => sum + (f.subscription_fee ?? 0), 0),
    pastDues: payments
      .filter((p) => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0),
  };
}

/**
 * What a factory still owes — live, from its pending invoices.
 *
 * The source mockup stored this as a one-time 50%-of-fee guess at creation that
 * only ever went up, so marking an invoice paid never reduced it. Computing it
 * means it cannot drift, and it agrees with the dashboard's Past Dues card by
 * construction.
 */
export function totalReceivableFor(payments: SubscriptionPayment[]): number {
  return payments.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
}

/**
 * PLACEHOLDER — a flat 40% of the subscription fee, carried over from the
 * source doc, which offers no rationale for it. Unlike the receivable above
 * there is no obviously-correct alternative to replace it with, so it is
 * ported as-is and labelled in the UI. Not cost accounting.
 */
export function monthlyExpenseFor(factory: Factory): number {
  return (factory.subscription_fee ?? 0) * 0.4;
}

export function formatMoney(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString()}`;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}
