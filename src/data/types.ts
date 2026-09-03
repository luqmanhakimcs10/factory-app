import { z } from 'zod';

/**
 * Domain types. These mirror the Supabase schema in
 * `supabase/migrations/0001_init.sql` exactly — field names and nullability
 * included. Changing one without the other is a bug.
 *
 * Each type is paired with a Zod schema used at the Supabase read/write
 * boundary. The `satisfies z.ZodType<T>` assertions make schema drift a
 * compile error rather than a runtime surprise.
 */

export type OrderStatus = 'draft' | 'in_progress' | 'completed';
export type OrderStage =
  | 'inspection'
  | 'coding'
  | 'jobcard'
  | 'production'
  | 'finishing'
  | 'delivery'
  | null;
export type UnitStatus = 'pending' | 'passed' | 'returned';
export type DefectType =
  | 'thread'
  | 'hole'
  | 'stain'
  | 'wrongcolor'
  | 'misalign'
  | 'other';
export type DefectScope = 'repeat' | 'sheet';

/** The 11 ERP roles. Only `order_taker` and `qa_person` have screens today. */
export type UserRole =
  | 'super_admin'
  | 'company_admin'
  | 'accountant'
  | 'floor_manager'
  | 'store_manager'
  | 'order_taker'
  | 'qa_person'
  | 'procurement'
  | 'delivery_person'
  | 'worker'
  | 'finishing_partner';

export interface Factory {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  factory_id: string;
  role: UserRole;
  full_name: string;
  /**
   * Platform operator, not a factory role.
   *
   * Kept as its own boolean rather than a `UserRole` value: every policy and
   * every navigation branch written since Prompt 1 keys off the enum, and a
   * tier that spans all tenants does not belong in the same switch as the
   * tiers scoped to one.
   */
  is_platform_admin: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  factory_id: string;
  name: string;
  phone: string;
  photo_url: string | null;
  shop_photo_taken: boolean;
}

export interface Order {
  id: string;
  factory_id: string;
  code: string;
  client_id: string;
  status: OrderStatus;
  stage: OrderStage;
  /** One proof photo covering every sheet on the order (not per colour). */
  proof_photo_url: string | null;
  design_sheet_photo_url: string | null;
  alert_text: string | null;
  created_at: string;
}

export interface OrderSheet {
  id: string;
  order_id: string;
  color_id: string;
  custom_hex: string | null;
  repeats: number;
  /** Per-sheet production progress. Null until production starts. */
  stage: SheetStage | null;
  /** Index into the order's finishing-stage queue. */
  stage_index: number;
  stage_records: StageRecord[];
}

// --- Floor Manager -----------------------------------------------------------

/**
 * The Floor Manager's granular workflow position, separate from the coarse
 * `stage` used by the shared Timeline.
 */
export type FloorStatus =
  | 'queued'
  | 'materialRequested'
  | 'readyToCollect'
  | 'machineAssigning'
  | 'productionAwaiting'
  | 'inProduction';

export type SheetStage =
  | 'producing'
  | 'readyForStage'
  | 'stageFormDone'
  | 'readyForFinal'
  | 'ready';

/** QA-owned: the colours that passed inspection, with their stitch counts. */
export interface ThreadEntry {
  color_id: string;
  stitches: number;
}

/** Floor-Manager-owned: which needle runs each colour, and for how many stitches. */
export interface NeedleEntry {
  color_id: string;
  needle: number;
  stitches: number;
}

export interface MaterialEntry {
  color_id: string;
  qty_grams: number;
}

export interface OrderStages {
  clipping: boolean;
  piko: boolean;
  press: boolean;
}

export interface StageRecord {
  key: string;
  delivery_person: string;
  worker_name: string;
}

export interface Billing {
  mode: 'stitch' | 'repeat';
  stitch_rate_per_1000?: number | null;
  repeat_price?: number | null;
}

export interface MachineJob {
  order_id: string;
  code: string;
  client: string;
  design_code?: string | null;
  needles: NeedleEntry[];
}

// --- Store Manager -----------------------------------------------------------

export type StockType = 'thread' | 'tilla' | 'sequin' | 'bobbin';
export type PoStatus =
  | 'awaitingProcurement'
  | 'awaitingConfirmation'
  | 'confirmed'
  | 'received';
export type PoSource = 'manual' | 'system_generated';
export type SequinCut = 'Cut' | 'Flat' | 'Cup';

export interface StockItem {
  id: string;
  factory_id: string;
  type: StockType;
  code: string;
  label: string;
  color_id: string | null;
  custom_hex: string | null;
  /** Thread and tilla. */
  quantity_grams: number | null;
  /** Sequin only. */
  size_mm: number | null;
  cut_type: SequinCut | null;
  /** Sequin only, counted in "CDs". */
  roll_count: number | null;
  /** Derived from roll_count; never typed in. Null until the conversion table exists. */
  piece_count: number | null;
  low_stock_threshold: number | null;
  created_at: string;
}

export interface Machine {
  id: string;
  factory_id: string;
  label: string;
  status: 'idle' | 'running';
  current_job: MachineJob | null;
  last_job: MachineJob | null;
  created_at: string;
}

export interface InspectionUnit {
  id: string;
  order_sheet_id: string;
  order_id: string;
  repeat_index_in_sheet: number;
  color_id: string;
  status: UnitStatus;
  passed_code: string | null;
  defect_type: DefectType | null;
  defect_photo_url: string | null;
  defect_scope: DefectScope | null;
}

/** The six pipeline stages, in fixed order — drives the `Timeline` component. */
export const ORDER_STAGES = [
  'inspection',
  'coding',
  'jobcard',
  'production',
  'finishing',
  'delivery',
] as const;

export const STAGE_LABELS: Record<NonNullable<OrderStage>, string> = {
  inspection: 'Initial Inspection',
  coding: 'QA Coding',
  jobcard: 'Job Card',
  production: 'Production',
  finishing: 'Finishing',
  delivery: 'Delivery',
};

// --- Zod schemas (Supabase boundary) ----------------------------------------

/**
 * A Postgres `uuid` value.
 *
 * Not `uuid()`: that enforces RFC 4122 version and variant bits, while the
 * `uuid` column type accepts any 32 hex digits. Seeded and hand-written ids
 * like '11111111-1111-1111-1111-111111111111' are perfectly valid to the
 * database and rejected by the stricter check, so validation here matches what
 * the column actually allows.
 */
export const uuid = () =>
  z
    .string()
    .regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      'Invalid UUID',
    );

export const floorStatusSchema = z.enum([
  'queued',
  'materialRequested',
  'readyToCollect',
  'machineAssigning',
  'productionAwaiting',
  'inProduction',
]);

export const sheetStageSchema = z.enum([
  'producing',
  'readyForStage',
  'stageFormDone',
  'readyForFinal',
  'ready',
]);

export const threadEntrySchema = z.object({
  color_id: z.string(),
  stitches: z.number(),
}) satisfies z.ZodType<ThreadEntry>;

export const needleEntrySchema = z.object({
  color_id: z.string(),
  needle: z.number(),
  stitches: z.number(),
}) satisfies z.ZodType<NeedleEntry>;

export const materialEntrySchema = z.object({
  color_id: z.string(),
  qty_grams: z.number(),
}) satisfies z.ZodType<MaterialEntry>;

export const orderStagesSchema = z.object({
  clipping: z.boolean(),
  piko: z.boolean(),
  press: z.boolean(),
}) satisfies z.ZodType<OrderStages>;

export const stageRecordSchema = z.object({
  key: z.string(),
  delivery_person: z.string(),
  worker_name: z.string(),
}) satisfies z.ZodType<StageRecord>;

export const billingSchema = z.object({
  mode: z.enum(['stitch', 'repeat']),
  stitch_rate_per_1000: z.number().nullish(),
  repeat_price: z.number().nullish(),
}) satisfies z.ZodType<Billing>;

export const orderStatusSchema = z.enum(['draft', 'in_progress', 'completed']);
export const orderStageSchema = z
  .enum(['inspection', 'coding', 'jobcard', 'production', 'finishing', 'delivery'])
  .nullable();
export const unitStatusSchema = z.enum(['pending', 'passed', 'returned']);
export const defectTypeSchema = z.enum([
  'thread',
  'hole',
  'stain',
  'wrongcolor',
  'misalign',
  'other',
]);
export const defectScopeSchema = z.enum(['repeat', 'sheet']);
export const userRoleSchema = z.enum([
  'super_admin',
  'company_admin',
  'accountant',
  'floor_manager',
  'store_manager',
  'order_taker',
  'qa_person',
  'procurement',
  'delivery_person',
  'worker',
  'finishing_partner',
]);

export const factorySchema = z.object({
  id: uuid(),
  name: z.string(),
  created_at: z.string(),
}) satisfies z.ZodType<Factory>;

export const profileSchema = z.object({
  id: uuid(),
  factory_id: uuid(),
  role: userRoleSchema,
  full_name: z.string(),
  is_platform_admin: z.boolean(),
  created_at: z.string(),
}) satisfies z.ZodType<Profile>;

export const clientSchema = z.object({
  id: uuid(),
  factory_id: uuid(),
  name: z.string(),
  phone: z.string(),
  photo_url: z.string().nullable(),
  shop_photo_taken: z.boolean(),
}) satisfies z.ZodType<Client>;

export const orderSchema = z.object({
  id: uuid(),
  factory_id: uuid(),
  code: z.string(),
  client_id: uuid(),
  status: orderStatusSchema,
  stage: orderStageSchema,
  proof_photo_url: z.string().nullable(),
  design_sheet_photo_url: z.string().nullable(),
  alert_text: z.string().nullable(),
  created_at: z.string(),
}) satisfies z.ZodType<Order>;

export const orderSheetSchema = z.object({
  id: uuid(),
  order_id: uuid(),
  color_id: z.string(),
  custom_hex: z.string().nullable(),
  repeats: z.number().int().positive(),
  stage: sheetStageSchema.nullable(),
  stage_index: z.number().int(),
  stage_records: z.array(stageRecordSchema),
}) satisfies z.ZodType<OrderSheet>;

export const stockTypeSchema = z.enum(['thread', 'tilla', 'sequin', 'bobbin']);
export const poStatusSchema = z.enum([
  'awaitingProcurement',
  'awaitingConfirmation',
  'confirmed',
  'received',
]);
export const poSourceSchema = z.enum(['manual', 'system_generated']);

export const stockItemSchema = z.object({
  id: uuid(),
  factory_id: uuid(),
  type: stockTypeSchema,
  code: z.string(),
  label: z.string(),
  color_id: z.string().nullable(),
  custom_hex: z.string().nullable(),
  quantity_grams: z.number().nullable(),
  size_mm: z.number().nullable(),
  cut_type: z.enum(['Cut', 'Flat', 'Cup']).nullable(),
  roll_count: z.number().nullable(),
  piece_count: z.number().nullable(),
  low_stock_threshold: z.number().nullable(),
  created_at: z.string(),
}) satisfies z.ZodType<StockItem>;

export const machineJobSchema = z.object({
  order_id: uuid(),
  code: z.string(),
  client: z.string(),
  design_code: z.string().nullish(),
  needles: z.array(needleEntrySchema),
}) satisfies z.ZodType<MachineJob>;

export const machineSchema = z.object({
  id: uuid(),
  factory_id: uuid(),
  label: z.string(),
  status: z.enum(['idle', 'running']),
  current_job: machineJobSchema.nullable(),
  last_job: machineJobSchema.nullable(),
  created_at: z.string(),
}) satisfies z.ZodType<Machine>;

export const inspectionUnitSchema = z.object({
  id: uuid(),
  order_sheet_id: uuid(),
  order_id: uuid(),
  repeat_index_in_sheet: z.number().int(),
  color_id: z.string(),
  status: unitStatusSchema,
  passed_code: z.string().nullable(),
  defect_type: defectTypeSchema.nullable(),
  defect_photo_url: z.string().nullable(),
  defect_scope: defectScopeSchema.nullable(),
}) satisfies z.ZodType<InspectionUnit>;

/**
 * Parse a Supabase result set, throwing on the first row that does not match.
 * Use at every read boundary so a schema change surfaces here and not three
 * screens deep.
 */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown): T[] {
  return z.array(schema).parse(rows);
}
