import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import { STAGE_ORDER, type StageKey } from '../../data/stageDefs';
import {
  uuid,
  billingSchema,
  floorStatusSchema,
  machineSchema,
  materialEntrySchema,
  needleEntrySchema,
  orderStagesSchema,
  orderStageSchema,
  sheetStageSchema,
  stageRecordSchema,
  threadEntrySchema,
  unitStatusSchema,
  type Machine,
  type MachineJob,
  type MaterialEntry,
  type NeedleEntry,
  type OrderStages,
  type SheetStage,
  type StageRecord,
  type ThreadEntry,
} from '../../data/types';

/**
 * Reads and writes for the Floor Manager module.
 *
 * This module owns one table of its own (`machines`); everything else is
 * columns on the shared `orders` / `order_sheets` rows, so most of what follows
 * is careful projection rather than new entities.
 */

// --- Row shapes -------------------------------------------------------------

const fmSheetSchema = z.object({
  id: uuid(),
  color_id: z.string(),
  custom_hex: z.string().nullable(),
  repeats: z.number().int().positive(),
  created_at: z.string(),
  stage: sheetStageSchema.nullable(),
  stage_index: z.number().int().nullable(),
  stage_records: z.array(stageRecordSchema).nullable(),
  inspection_units: z.array(z.object({ status: unitStatusSchema })),
});

const fmOrderSchema = z.object({
  id: uuid(),
  code: z.string(),
  stage: orderStageSchema,
  floor_status: floorStatusSchema.nullable(),
  design_code: z.string().nullable(),
  job_card_code: z.string().nullable(),
  threads: z.array(threadEntrySchema).nullable(),
  needles: z.array(needleEntrySchema).nullable(),
  materials: z.array(materialEntrySchema).nullable(),
  stages: orderStagesSchema.nullable(),
  excluded_note: z.string().nullable(),
  damaged_repeats_price: z.number().nullable(),
  billing: billingSchema.nullable(),
  created_at: z.string(),
  clients: z.object({ name: z.string() }).nullable(),
  order_sheets: z.array(fmSheetSchema),
});

export type FmOrder = z.infer<typeof fmOrderSchema>;
export type FmSheet = z.infer<typeof fmSheetSchema>;

const ORDER_SELECT =
  'id, code, stage, floor_status, design_code, job_card_code, threads, needles, materials, stages, excluded_note, damaged_repeats_price, billing, created_at, clients(name), order_sheets(id, color_id, custom_hex, repeats, created_at, stage, stage_index, stage_records, inspection_units(status))';

/** Sheets in a stable order — repeat codes and the sheet list depend on it. */
export function sortedSheets(order: FmOrder): FmSheet[] {
  return [...order.order_sheets].sort((a, b) =>
    a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at < b.created_at ? -1 : 1,
  );
}

const ORDER_SCAN_LIMIT = 200;

export async function listFloorOrders(factoryId: string): Promise<FmOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('factory_id', factoryId)
    .order('created_at', { ascending: false })
    .limit(ORDER_SCAN_LIMIT);

  if (error) throw error;
  return z.array(fmOrderSchema).parse(data);
}

export async function getFloorOrder(orderId: string): Promise<FmOrder> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single();

  if (error) throw error;
  return fmOrderSchema.parse(data);
}

// --- Tab filters ------------------------------------------------------------

export type HomeTab =
  | 'all'
  | 'jobcards'
  | 'inventory'
  | 'machines'
  | 'production'
  | 'ready';

/** Every sheet on the order has finished its stage queue. */
export function allSheetsReady(order: FmOrder): boolean {
  return (
    order.order_sheets.length > 0 &&
    order.order_sheets.every((sheet) => sheet.stage === 'ready')
  );
}

/**
 * Which tab an order belongs to.
 *
 * The Job Cards filter is `floor_status IS NULL AND stage = 'coding'` — that is
 * exactly what Prompt 3's trigger leaves behind when every unit on an order has
 * been inspected.
 */
export function orderMatchesTab(order: FmOrder, tab: HomeTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'jobcards':
      return order.floor_status === null && order.stage === 'coding';
    case 'inventory':
      return (
        order.floor_status === 'materialRequested' ||
        order.floor_status === 'readyToCollect'
      );
    case 'machines':
      return order.floor_status === 'machineAssigning';
    case 'production':
      return (
        (order.floor_status === 'productionAwaiting' ||
          order.floor_status === 'inProduction') &&
        !allSheetsReady(order)
      );
    case 'ready':
      return order.floor_status === 'inProduction' && allSheetsReady(order);
  }
}

// --- Derived figures --------------------------------------------------------

export function totalRepeats(order: FmOrder): number {
  return order.order_sheets.reduce((sum, sheet) => sum + sheet.repeats, 0);
}

export function perRepeatStitches(needles: NeedleEntry[]): number {
  return needles.reduce((sum, entry) => sum + entry.stitches, 0);
}

export function totalStitches(needles: NeedleEntry[], repeats: number): number {
  return perRepeatStitches(needles) * repeats;
}

/**
 * PLACEHOLDER COSTING — from the source mockup, not from the factory.
 *
 * `max(50, round(stitches_for_colour * total_repeats / 10))`, where
 * `total_repeats` is the order-wide count as written in the spec, not the
 * repeats of that one colour. Do not treat these grams as real until someone
 * who buys thread has confirmed them.
 */
export function computeMaterials(
  needles: NeedleEntry[],
  repeats: number,
): MaterialEntry[] {
  return needles.map((entry) => ({
    color_id: entry.color_id,
    qty_grams: Math.max(50, Math.round((entry.stitches * repeats) / 10)),
  }));
}

/**
 * Display-only repeat codes: `{orderNumberSuffix}-{sheetIndex + 1}.{repeat}`.
 * Never stored — regenerating them is cheaper than keeping them in sync.
 */
export function repeatCodes(
  orderCode: string,
  sheetIndex: number,
  repeats: number,
): string[] {
  const suffix = orderCode.split('-').at(-1) ?? orderCode;
  return Array.from(
    { length: repeats },
    (_, index) => `${suffix}-${sheetIndex + 1}.${index + 1}`,
  );
}

/**
 * The thread list the job card starts from.
 *
 * `orders.threads` is meant to be seeded by QA after inspection, but nothing
 * writes it yet. Until something does, it is derived here from the sheets that
 * actually have a passed unit — which is also the integrity rule the
 * `excluded_note` mechanic implies, enforced in the application rather than the
 * schema. Stitch counts start at zero; the floor manager types the real ones.
 */
export function seedThreads(order: FmOrder): ThreadEntry[] {
  if (order.threads && order.threads.length > 0) return order.threads;

  const seen = new Set<string>();
  const threads: ThreadEntry[] = [];

  for (const sheet of sortedSheets(order)) {
    const passed = sheet.inspection_units.some((unit) => unit.status === 'passed');
    if (!passed || seen.has(sheet.color_id)) continue;
    seen.add(sheet.color_id);
    threads.push({ color_id: sheet.color_id, stitches: 0 });
  }

  return threads;
}

/** The finishing stages this order runs, in fixed order. Shared by every sheet. */
export function stageQueue(stages: OrderStages | null): StageKey[] {
  if (!stages) return [];
  return STAGE_ORDER.filter((key) => stages[key]);
}

export interface Invoice {
  totalRepeats: number;
  perRepeatStitches: number;
  totalBill: number;
  damaged: number;
  remainingReceivable: number;
}

/** Billing rates are read-only in this module — nothing here can set them. */
export function computeInvoice(order: FmOrder): Invoice | null {
  if (!order.billing) return null;

  const repeats = totalRepeats(order);
  const perRepeat = perRepeatStitches(order.needles ?? []);
  const damaged = order.damaged_repeats_price ?? 0;

  const totalBill =
    order.billing.mode === 'repeat'
      ? repeats * (order.billing.repeat_price ?? 0)
      : Math.round(
          ((perRepeat * repeats) / 1000) * (order.billing.stitch_rate_per_1000 ?? 0),
        );

  return {
    totalRepeats: repeats,
    perRepeatStitches: perRepeat,
    totalBill,
    damaged,
    remainingReceivable: totalBill - damaged,
  };
}

// --- Codes ------------------------------------------------------------------

async function nextCode(fn: 'next_design_code' | 'next_job_card_code'): Promise<string> {
  const { data, error } = await supabase.rpc(fn);
  if (error) throw error;
  return z.string().parse(data);
}

export const nextDesignCode = () => nextCode('next_design_code');
export const nextJobCardCode = () => nextCode('next_job_card_code');

// --- Writes -----------------------------------------------------------------

async function patchOrder(orderId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
  if (error) throw error;
}

export interface ApproveJobCardArgs {
  orderId: string;
  designCode: string;
  jobCardCode: string;
  needles: NeedleEntry[];
  materials: MaterialEntry[];
  stages: OrderStages;
}

/** Client approved the job card: freeze it onto the order and ask the store. */
export async function approveJobCard(args: ApproveJobCardArgs): Promise<void> {
  await patchOrder(args.orderId, {
    design_code: args.designCode,
    job_card_code: args.jobCardCode,
    needles: args.needles,
    materials: args.materials,
    stages: args.stages,
    floor_status: 'materialRequested',
  });
}

/** Materials collected from the store — the order can be put on a machine. */
export async function acceptMaterials(args: {
  factoryId: string;
  orderId: string;
  photoUri: string;
}): Promise<void> {
  await uploadPhoto({
    bucket: BUCKETS.jobCardPhotos,
    factoryId: args.factoryId,
    folder: args.orderId,
    uri: args.photoUri,
    name: 'collect-proof',
  });

  await patchOrder(args.orderId, { floor_status: 'machineAssigning' });
}

export async function listMachines(factoryId: string): Promise<Machine[]> {
  const { data, error } = await supabase
    .from('machines')
    .select('id, factory_id, label, status, current_job, last_job, created_at')
    .eq('factory_id', factoryId)
    .order('label');

  if (error) throw error;
  return z.array(machineSchema).parse(data);
}

export async function getMachine(machineId: string): Promise<Machine> {
  const { data, error } = await supabase
    .from('machines')
    .select('id, factory_id, label, status, current_job, last_job, created_at')
    .eq('id', machineId)
    .single();

  if (error) throw error;
  return machineSchema.parse(data);
}

export async function assignMachine(args: {
  machineId: string;
  orderId: string;
  job: MachineJob;
}): Promise<void> {
  const { error } = await supabase
    .from('machines')
    .update({ status: 'running', current_job: args.job })
    .eq('id', args.machineId);
  if (error) throw error;

  await patchOrder(args.orderId, { floor_status: 'productionAwaiting' });
}

/** Job off the machine: what was running becomes the reference for the next one. */
export async function completeMachineJob(machine: Machine): Promise<void> {
  const { error } = await supabase
    .from('machines')
    .update({ status: 'idle', current_job: null, last_job: machine.current_job })
    .eq('id', machine.id);
  if (error) throw error;
}

/** Every sheet starts producing together — production is per order, not per sheet. */
export async function startProduction(order: FmOrder): Promise<void> {
  const { error } = await supabase
    .from('order_sheets')
    .update({ stage: 'producing', stage_index: 0 })
    .eq('order_id', order.id);
  if (error) throw error;

  await patchOrder(order.id, { floor_status: 'inProduction' });
}

export async function patchSheet(
  sheetId: string,
  patch: { stage?: SheetStage; stage_index?: number; stage_records?: StageRecord[] },
): Promise<void> {
  const { error } = await supabase.from('order_sheets').update(patch).eq('id', sheetId);
  if (error) throw error;
}

export async function setDamagedRepeatsPrice(
  orderId: string,
  price: number,
): Promise<void> {
  await patchOrder(orderId, { damaged_repeats_price: price });
}

/**
 * Who signed off on this order.
 *
 * TEMPORARY-ish: the floor manager is the signed-in user, and the inspection
 * manager is whoever the QA module recorded against this order's units. There
 * is no assignment table yet, so neither is a real "assigned to" lookup.
 */
export async function getHandledBy(orderId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('inspection_units')
    .select('profiles:inspected_by(full_name)')
    .eq('order_id', orderId)
    .not('inspected_by', 'is', null)
    .limit(1);

  if (error) throw error;

  const parsed = z
    .array(z.object({ profiles: z.object({ full_name: z.string() }).nullable() }))
    .parse(data);

  return parsed[0]?.profiles?.full_name ?? null;
}
