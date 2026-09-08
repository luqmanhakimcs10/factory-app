import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import { uuid, type StockType } from '../../data/types';
import { formatRs } from '../../lib/ledgerMath';

/**
 * The five master-data rosters Company Admin owns.
 *
 * `0010_company_admin.sql` created four of these tables and extended a fifth
 * (`clients`) in place, then nothing was built against them. This file is that
 * missing half: one read and one upsert per roster, plus the label maps the
 * forms and lists share.
 *
 * Every roster except `bonus_slabs` carries a `status` of `active` / `inactive`
 * and is deactivated rather than deleted — a supplier the factory stopped
 * buying from still appears on last year's purchase orders, and a row that
 * vanishes takes that history's referent with it. `bonus_slabs` is the one
 * exception and really is deleted: a slab is a rule, not a record of anything
 * that happened.
 *
 * The label maps live here rather than in `data/` because every value they
 * name is defined by a Postgres enum or check constraint in that same
 * migration. Keeping the copy beside the reads means one file changes when a
 * constraint does.
 */

// --- Shared vocabulary ------------------------------------------------------

export const ROSTER_STATUSES = ['active', 'inactive'] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];
const rosterStatusSchema = z.enum(ROSTER_STATUSES);

/** `employee_role`, in the mockup's chip order — not alphabetical. */
export const EMPLOYEE_ROLES = [
  'inspection_manager',
  'floor_manager',
  'store_manager',
  'machine_worker',
  'admin',
  'accountant',
  'delivery',
] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
  inspection_manager: 'Inspection Manager',
  floor_manager: 'Floor Manager',
  store_manager: 'Store Manager',
  machine_worker: 'Machine Worker',
  admin: 'Admin',
  accountant: 'Accountant',
  delivery: 'Delivery',
};

/**
 * `responsibility`, in the mockup's chip order.
 *
 * These ids are the grant names the database checks: `has_grant('orderTaking')`
 * and friends read exactly these strings, and `0013_staff_persona.sql` renamed
 * the enum's labels to match. A typo here is a capability that silently never
 * applies, so the list is defined once and everything else derives from it.
 */
export const RESPONSIBILITIES = [
  'orderTaking',
  'orderReturn',
  'orderDelivery',
  'procurePo',
  'sheetMovement',
] as const;
export type Responsibility = (typeof RESPONSIBILITIES)[number];

export const RESPONSIBILITY_LABELS: Record<Responsibility, string> = {
  orderTaking: 'Order Taking',
  orderReturn: 'Order Returns',
  orderDelivery: 'Order Delivery',
  procurePo: 'Inventory Procurement',
  sheetMovement: 'Delivery & Pickup Sheets from Finishing Partners',
};

/**
 * Responsibilities are only meaningful for a `delivery` employee.
 *
 * The same shape as `allowsSalaryBasisChoice`: the column exists on every row
 * and means nothing on most of them, so the form hides the picker rather than
 * offering grants that would never be checked.
 */
export function allowsResponsibilities(role: EmployeeRole | null): boolean {
  return role === 'delivery';
}

export const SALARY_BASES = ['fixed', 'per_day', 'per_stitch'] as const;
export type SalaryBasis = (typeof SALARY_BASES)[number];

export const SALARY_BASIS_LABELS: Record<SalaryBasis, string> = {
  fixed: 'Fixed',
  per_day: 'Per Day',
  per_stitch: 'Per Stitch',
};

/** The form's own field label, which changes with the basis. */
export const SALARY_AMOUNT_LABELS: Record<SalaryBasis, string> = {
  fixed: 'Monthly Salary (Rs.)',
  per_day: 'Daily Rate (Rs.)',
  per_stitch: 'Rate per Stitch (Rs.)',
};

/** The roster sub-line is tight, so it abbreviates; the form field does not. */
const SALARY_SUFFIX_SHORT: Record<SalaryBasis, string> = {
  fixed: '/mo',
  per_day: '/day',
  per_stitch: '/stitch',
};

const SALARY_SUFFIX_LONG: Record<SalaryBasis, string> = {
  fixed: ' /month',
  per_day: ' /day',
  per_stitch: ' /stitch',
};

/**
 * Pay basis other than `fixed` only means something for someone paid by output.
 *
 * The same rule as the `salary_basis_matches_role` check constraint, restated
 * on this side so the form can gray the picker out rather than let the write
 * fail. Both exist on purpose: the constraint is the boundary, this is the UI.
 */
export function allowsSalaryBasisChoice(role: EmployeeRole | null): boolean {
  return role === 'machine_worker';
}

/** "Rs. 18,000/mo" — the roster sub-line. */
export function salaryLabel(basis: SalaryBasis, amount: number | null): string {
  if (amount === null) return 'No rate set';
  return `${formatRs(amount)}${SALARY_SUFFIX_SHORT[basis]}`;
}

/** "Rs. 18,000 /month" — the form's filled price field. */
export function salaryFieldValue(basis: SalaryBasis, amount: number | null): string | null {
  if (amount === null) return null;
  return `${formatRs(amount)}${SALARY_SUFFIX_LONG[basis]}`;
}

export const FINISHING_STAGES = ['clipping', 'piko', 'press'] as const;
export type FinishingStage = (typeof FINISHING_STAGES)[number];

export const FINISHING_STAGE_LABELS: Record<FinishingStage, string> = {
  clipping: 'Clipping',
  piko: 'Piko',
  press: 'Press',
};

export const INVENTORY_TYPES = ['thread', 'tilla', 'sequin', 'bobbin'] as const;

export const INVENTORY_TYPE_LABELS: Record<StockType, string> = {
  thread: 'Thread',
  tilla: 'Tilla',
  sequin: 'Sequin',
  bobbin: 'Bobbin',
};

export const PAYMENT_CYCLES = ['weekly', 'biweekly', 'monthly'] as const;
export type PaymentCycle = (typeof PAYMENT_CYCLES)[number];

export const PAYMENT_CYCLE_LABELS: Record<PaymentCycle, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-Weekly',
  monthly: 'Monthly',
};

export const BILLING_TYPES = ['repeat', 'stitch'] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  repeat: 'Per Repeat',
  stitch: 'Per Stitch',
};

/** The rate field's label follows the billing type it prices. */
export const BILLING_RATE_LABELS: Record<BillingType, string> = {
  repeat: 'Rate per Repeat (Rs.)',
  stitch: 'Rate per 1,000 Stitches (Rs.)',
};

/** "Jan 2024" — join dates and month stamps read as month and year, never a day. */
export function monthYear(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

// --- Employees --------------------------------------------------------------

const employeeSchema = z.object({
  id: uuid(),
  name: z.string(),
  role: z.enum(EMPLOYEE_ROLES),
  salary_basis: z.enum(SALARY_BASES),
  salary_amount: z.number().nullable(),
  contact: z.string().nullable(),
  address: z.string().nullable(),
  cnic: z.string().nullable(),
  cnic_photo_url: z.string().nullable(),
  employee_photo_url: z.string().nullable(),
  reference_name: z.string().nullable(),
  responsibilities: z.array(z.enum(RESPONSIBILITIES)).nullable(),
  profile_id: uuid().nullable(),
  join_date: z.string(),
  status: rosterStatusSchema,
});

export type Employee = z.infer<typeof employeeSchema>;

const EMPLOYEE_SELECT =
  'id, name, role, salary_basis, salary_amount, contact, address, cnic, cnic_photo_url, employee_photo_url, reference_name, responsibilities, profile_id, join_date, status';

export async function listEmployees(factoryId: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select(EMPLOYEE_SELECT)
    .eq('factory_id', factoryId)
    .order('name');

  if (error) throw error;
  return z.array(employeeSchema).parse(data);
}

/**
 * Whether a photo field holds something the picker just produced.
 *
 * A form's photo state is either a freshly captured local URI or the storage
 * path already on the row, and the two need opposite handling: one is uploaded
 * on save and displayed directly, the other is signed for display and written
 * back untouched. One predicate so the save path and the render path cannot
 * disagree about which is which.
 */
export function isLocalPhotoUri(value: string): boolean {
  return /^(file|blob|content|assets-library|ph|data):/i.test(value);
}

export interface EmployeeInput {
  name: string;
  role: EmployeeRole;
  salaryBasis: SalaryBasis;
  salaryAmount: number;
  contact: string | null;
  address: string | null;
  cnic: string | null;
  /** Storage path, or a local URI to be uploaded first. */
  employeePhoto: string | null;
  cnicPhoto: string | null;
  referenceName: string | null;
  /** Empty for every role but `delivery`. Never null — an empty grant list. */
  responsibilities: Responsibility[];
  /** The `profiles` row this employee signs in as, or null for no login. */
  profileId: string | null;
  status: RosterStatus;
}

/**
 * A local camera URI needs uploading; a path already in the column does not.
 *
 * Editing an employee re-submits whatever the tile is showing, and that is a
 * storage path for a photo the form never touched. Re-uploading it would put a
 * second copy of the same image in the bucket on every save.
 */
async function resolvePhoto(
  factoryId: string,
  folder: string,
  name: string,
  value: string | null,
): Promise<string | null> {
  if (!value) return null;
  if (!isLocalPhotoUri(value)) return value;

  return uploadPhoto({
    bucket: BUCKETS.employeeDocs,
    factoryId,
    folder,
    uri: value,
    name,
  });
}

export async function saveEmployee(args: {
  factoryId: string;
  id?: string;
  input: EmployeeInput;
}): Promise<void> {
  const { factoryId, id, input } = args;

  const [employeePhotoUrl, cnicPhotoUrl] = await Promise.all([
    resolvePhoto(factoryId, 'employees', 'employee', input.employeePhoto),
    resolvePhoto(factoryId, 'employees', 'cnic', input.cnicPhoto),
  ]);

  const row = {
    factory_id: factoryId,
    name: input.name,
    role: input.role,
    salary_basis: input.salaryBasis,
    salary_amount: input.salaryAmount,
    contact: input.contact,
    address: input.address,
    cnic: input.cnic,
    cnic_photo_url: cnicPhotoUrl,
    employee_photo_url: employeePhotoUrl,
    reference_name: input.referenceName,
    responsibilities: input.responsibilities,
    profile_id: input.profileId,
    status: input.status,
  };

  // `join_date` defaults to today on insert and is never sent on update: it is
  // the one field on this form the admin cannot edit, and re-sending it on
  // every save is how a read-only field quietly stops being one.
  const { error } = id
    ? await supabase.from('employees').update(row).eq('id', id)
    : await supabase.from('employees').insert(row);

  if (error) throw error;
}

/**
 * The sign-in accounts in this factory, for the optional login link above.
 *
 * `profiles` is readable factory-wide (0002_rls.sql), so this needs no special
 * grant. It is deliberately unfiltered by role: which module a login lands in
 * is that login's own `role`, and an admin linking a roster row to it is
 * recording who a person *is*, not deciding what they can do.
 */
const loginProfileSchema = z.object({
  id: uuid(),
  full_name: z.string(),
  role: z.string(),
});

export type LoginProfile = z.infer<typeof loginProfileSchema>;

export async function listProfiles(factoryId: string): Promise<LoginProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('factory_id', factoryId)
    .order('full_name');

  if (error) throw error;
  return z.array(loginProfileSchema).parse(data);
}

// --- Finishing partners -----------------------------------------------------

const finishingPartnerSchema = z.object({
  id: uuid(),
  name: z.string(),
  stage_type: z.enum(FINISHING_STAGES),
  rate: z.number(),
  sla_hours: z.number(),
  contact: z.string().nullable(),
  address: z.string().nullable(),
  cnic: z.string().nullable(),
  cnic_photo_url: z.string().nullable(),
  status: rosterStatusSchema,
});

export type FinishingPartner = z.infer<typeof finishingPartnerSchema>;

const FINISHING_PARTNER_SELECT =
  'id, name, stage_type, rate, sla_hours, contact, address, cnic, cnic_photo_url, status';

/** The column's own default, and the form's starting value for a new partner. */
export const DEFAULT_SLA_HOURS = 24;

/** "24h turnaround" — the roster sub-line and the form's filled field. */
export function slaLabel(hours: number): string {
  return `${hours}h turnaround`;
}

export async function listFinishingPartners(
  factoryId: string,
): Promise<FinishingPartner[]> {
  const { data, error } = await supabase
    .from('finishing_partners')
    .select(FINISHING_PARTNER_SELECT)
    .eq('factory_id', factoryId)
    .order('name');

  if (error) throw error;
  return z.array(finishingPartnerSchema).parse(data);
}

export interface FinishingPartnerInput {
  name: string;
  stage: FinishingStage;
  rate: number;
  /**
   * How long this partner is expected to hold a batch.
   *
   * Snapshotted onto each `movements` row at creation, never read live from
   * here — raising a partner's SLA next month must not retroactively rescue a
   * movement that is already late.
   */
  slaHours: number;
  contact: string | null;
  address: string | null;
  cnic: string | null;
  cnicPhoto: string | null;
  status: RosterStatus;
}

export async function saveFinishingPartner(args: {
  factoryId: string;
  id?: string;
  input: FinishingPartnerInput;
}): Promise<void> {
  const { factoryId, id, input } = args;

  const cnicPhotoUrl = await resolvePhoto(
    factoryId,
    'finishing-partners',
    'cnic',
    input.cnicPhoto,
  );

  const row = {
    factory_id: factoryId,
    name: input.name,
    stage_type: input.stage,
    // `rate_basis` is deliberately not sent. The column defaults to
    // 'per_repeat', the enum has exactly that one value, and the form renders
    // it as a static field for the same reason — a second basis was removed
    // from the spec on purpose and is not to be reintroduced through a write.
    rate: input.rate,
    sla_hours: input.slaHours,
    contact: input.contact,
    address: input.address,
    cnic: input.cnic,
    cnic_photo_url: cnicPhotoUrl,
    status: input.status,
  };

  const { error } = id
    ? await supabase.from('finishing_partners').update(row).eq('id', id)
    : await supabase.from('finishing_partners').insert(row);

  if (error) throw error;
}

// --- Suppliers --------------------------------------------------------------

const supplierSchema = z.object({
  id: uuid(),
  name: z.string(),
  contact: z.string().nullable(),
  address: z.string().nullable(),
  inventory_type: z.enum(INVENTORY_TYPES),
  payment_cycle: z.enum(PAYMENT_CYCLES),
  status: rosterStatusSchema,
});

export type Supplier = z.infer<typeof supplierSchema>;

const SUPPLIER_SELECT =
  'id, name, contact, address, inventory_type, payment_cycle, status';

export async function listSuppliers(factoryId: string): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select(SUPPLIER_SELECT)
    .eq('factory_id', factoryId)
    .order('name');

  if (error) throw error;
  return z.array(supplierSchema).parse(data);
}

export interface SupplierInput {
  name: string;
  contact: string | null;
  address: string | null;
  inventoryType: StockType;
  paymentCycle: PaymentCycle;
  status: RosterStatus;
}

export async function saveSupplier(args: {
  factoryId: string;
  id?: string;
  input: SupplierInput;
}): Promise<void> {
  const { factoryId, id, input } = args;

  const row = {
    factory_id: factoryId,
    name: input.name,
    contact: input.contact,
    address: input.address,
    inventory_type: input.inventoryType,
    payment_cycle: input.paymentCycle,
    status: input.status,
  };

  const { error } = id
    ? await supabase.from('suppliers').update(row).eq('id', id)
    : await supabase.from('suppliers').insert(row);

  if (error) throw error;
}

// --- Clients ----------------------------------------------------------------

/**
 * The same `clients` rows the Order Taker creates, with the business terms
 * filled in.
 *
 * Deliberately not a second table, per the migration: a client picked at
 * intake and a client billed at month end have to be one row or the factory
 * ends up with two client lists that disagree. Every term is nullable because
 * intake only captures name, phone and photo — an untermed client is the
 * normal starting state here, not a broken row.
 */
const clientSchema = z.object({
  id: uuid(),
  name: z.string(),
  phone: z.string(),
  address: z.string().nullable(),
  billing_type: z.enum(BILLING_TYPES).nullable(),
  rate: z.number().nullable(),
  payment_cycle: z.enum(PAYMENT_CYCLES).nullable(),
  status: rosterStatusSchema,
});

export type AdminClient = z.infer<typeof clientSchema>;

const CLIENT_SELECT = 'id, name, phone, address, billing_type, rate, payment_cycle, status';

export async function listClients(factoryId: string): Promise<AdminClient[]> {
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_SELECT)
    .eq('factory_id', factoryId)
    .order('name');

  if (error) throw error;
  return z.array(clientSchema).parse(data);
}

export interface ClientInput {
  name: string;
  phone: string;
  address: string | null;
  billingType: BillingType;
  rate: number;
  paymentCycle: PaymentCycle;
  status: RosterStatus;
}

export async function saveClient(args: {
  factoryId: string;
  id?: string;
  input: ClientInput;
}): Promise<void> {
  const { factoryId, id, input } = args;

  const row = {
    factory_id: factoryId,
    name: input.name,
    phone: input.phone,
    address: input.address,
    billing_type: input.billingType,
    rate: input.rate,
    payment_cycle: input.paymentCycle,
    status: input.status,
  };

  const { error } = id
    ? await supabase.from('clients').update(row).eq('id', id)
    : await supabase.from('clients').insert(row);

  if (error) throw error;
}

// --- Bonus slabs ------------------------------------------------------------

const bonusSlabSchema = z.object({
  id: uuid(),
  threshold: z.number(),
  bonus_amount: z.number(),
});

export type BonusSlab = z.infer<typeof bonusSlabSchema>;

/**
 * Slabs low to high, always.
 *
 * Sorted by the database rather than by each screen that lists them: the
 * qualifying-slab lookup below walks the list assuming ascending order, and a
 * caller that forgot to sort would silently award the wrong bonus.
 */
export async function listBonusSlabs(factoryId: string): Promise<BonusSlab[]> {
  const { data, error } = await supabase
    .from('bonus_slabs')
    .select('id, threshold, bonus_amount')
    .eq('factory_id', factoryId)
    .order('threshold');

  if (error) throw error;
  return z.array(bonusSlabSchema).parse(data);
}

/** The best slab a daily average earns, or null when it clears none of them. */
export function qualifyingSlab(
  slabs: BonusSlab[],
  avgStitchesPerDay: number,
): BonusSlab | null {
  let best: BonusSlab | null = null;
  for (const slab of slabs) {
    if (avgStitchesPerDay >= slab.threshold) best = slab;
  }
  return best;
}

export async function saveBonusSlab(args: {
  factoryId: string;
  id?: string;
  threshold: number;
  bonusAmount: number;
}): Promise<void> {
  const row = {
    factory_id: args.factoryId,
    threshold: args.threshold,
    bonus_amount: args.bonusAmount,
  };

  const { error } = args.id
    ? await supabase.from('bonus_slabs').update(row).eq('id', args.id)
    : await supabase.from('bonus_slabs').insert(row);

  if (error) throw error;
}

export async function deleteBonusSlab(id: string): Promise<void> {
  const { error } = await supabase.from('bonus_slabs').delete().eq('id', id);
  if (error) throw error;
}
