import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import {
  uuid,
  defectScopeSchema,
  defectTypeSchema,
  orderStageSchema,
  unitStatusSchema,
  type DefectScope,
  type DefectType,
} from '../../data/types';

/**
 * Reads and writes for the QA Initial Inspection module.
 *
 * Inspection is per *unit*, not per sheet: an order of "red x2, royal x1" is
 * three separate decisions. Everything below is built around that.
 */

// --- Canonical unit ordering ------------------------------------------------

/**
 * Units have to carry a stable overall position across the whole order — it is
 * what the "Repeat N of {total}" title and the `passed_code` are built from, so
 * it must not shuffle between two loads of the same order.
 *
 * The order is: sheets by when they were created, then repeats within a sheet.
 */
function compareUnits(a: OrderUnit, b: OrderUnit): number {
  if (a.sheetCreatedAt !== b.sheetCreatedAt) {
    return a.sheetCreatedAt < b.sheetCreatedAt ? -1 : 1;
  }
  if (a.orderSheetId !== b.orderSheetId) {
    return a.orderSheetId < b.orderSheetId ? -1 : 1;
  }
  return a.repeatIndexInSheet - b.repeatIndexInSheet;
}

// --- Queue ------------------------------------------------------------------

const queueOrderSchema = z.object({
  id: uuid(),
  code: z.string(),
  stage: orderStageSchema,
  created_at: z.string(),
  clients: z.object({ name: z.string() }).nullable(),
  order_sheets: z.array(
    z.object({ color_id: z.string(), custom_hex: z.string().nullable() }),
  ),
  inspection_units: z.array(
    z.object({
      status: unitStatusSchema,
      inspected_at: z.string().nullable(),
    }),
  ),
});

export interface QueueOrder {
  id: string;
  code: string;
  clientName: string;
  swatches: { colorId: string; customHex: string | null }[];
  total: number;
  done: number;
  passed: number;
  returned: number;
  /** Most recent `inspected_at` across the order's units, if any. */
  lastInspectedAt: string | null;
}

export interface InspectionQueue {
  /** Orders with at least one pending unit. */
  pending: QueueOrder[];
  /** Fully inspected, and the last decision landed today. */
  inspectedToday: QueueOrder[];
}

/**
 * How many orders to consider for the queue.
 *
 * Partitioning happens on the client because "has a pending unit" and
 * "finished today" are both aggregates over the embedded units. A factory does
 * not have hundreds of live orders at once; if that changes, this becomes a
 * database view.
 */
const QUEUE_SCAN_LIMIT = 100;

function isSameLocalDay(iso: string, reference: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

export async function getInspectionQueue(factoryId: string): Promise<InspectionQueue> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, code, stage, created_at, clients(name), order_sheets(color_id, custom_hex), inspection_units(status, inspected_at)',
    )
    .eq('factory_id', factoryId)
    .order('created_at', { ascending: false })
    .limit(QUEUE_SCAN_LIMIT);

  if (error) throw error;

  const rows = z.array(queueOrderSchema).parse(data);
  const today = new Date();

  const pending: QueueOrder[] = [];
  const inspectedToday: QueueOrder[] = [];

  for (const row of rows) {
    const units = row.inspection_units;
    if (units.length === 0) continue;

    const inspectedAts = units
      .map((unit) => unit.inspected_at)
      .filter((value): value is string => Boolean(value));

    const order: QueueOrder = {
      id: row.id,
      code: row.code,
      clientName: row.clients?.name ?? 'Unknown client',
      swatches: dedupeSwatches(row.order_sheets),
      total: units.length,
      done: units.filter((unit) => unit.status !== 'pending').length,
      passed: units.filter((unit) => unit.status === 'passed').length,
      returned: units.filter((unit) => unit.status === 'returned').length,
      lastInspectedAt: inspectedAts.sort().at(-1) ?? null,
    };

    if (order.done < order.total) {
      pending.push(order);
    } else if (order.lastInspectedAt && isSameLocalDay(order.lastInspectedAt, today)) {
      // Scoped by when inspection finished, not when the order was taken.
      inspectedToday.push(order);
    }
  }

  return { pending, inspectedToday };
}

/** One swatch per distinct colour on the order, in sheet order. */
function dedupeSwatches(
  sheets: { color_id: string; custom_hex: string | null }[],
): { colorId: string; customHex: string | null }[] {
  const seen = new Set<string>();
  const result: { colorId: string; customHex: string | null }[] = [];

  for (const sheet of sheets) {
    const key = `${sheet.color_id}:${sheet.custom_hex ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ colorId: sheet.color_id, customHex: sheet.custom_hex });
  }
  return result;
}

// --- One order's units ------------------------------------------------------

const orderUnitsSchema = z.object({
  id: uuid(),
  code: z.string(),
  /**
   * The single order-level proof photo. There is no per-sheet proof photo any
   * more — Order Taker v2 replaced it with one photo covering every sheet, so
   * every unit on the order shows the same image.
   */
  proof_photo_url: z.string().nullable(),
  order_sheets: z.array(
    z.object({
      id: uuid(),
      color_id: z.string(),
      custom_hex: z.string().nullable(),
      repeats: z.number().int().positive(),
      created_at: z.string(),
      inspection_units: z.array(
        z.object({
          id: uuid(),
          repeat_index_in_sheet: z.number().int(),
          status: unitStatusSchema,
          passed_code: z.string().nullable(),
          defect_type: defectTypeSchema.nullable(),
          defect_scope: defectScopeSchema.nullable(),
        }),
      ),
    }),
  ),
});

export interface OrderUnit {
  id: string;
  orderSheetId: string;
  sheetCreatedAt: string;
  colorId: string;
  customHex: string | null;
  /** Total repeats on this unit's sheet — the "of Y" in "Repeat X of Y". */
  sheetRepeats: number;
  repeatIndexInSheet: number;
  status: 'pending' | 'passed' | 'returned';
  /** 1-based position across the whole order. */
  position: number;
}

export interface OrderUnits {
  orderId: string;
  orderCode: string;
  proofPhotoPath: string | null;
  units: OrderUnit[];
  total: number;
  passed: number;
  returned: number;
  pending: number;
}

/** Everything the Inspect and Complete screens need, in one read. */
export async function getOrderUnits(orderId: string): Promise<OrderUnits> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, code, proof_photo_url, order_sheets(id, color_id, custom_hex, repeats, created_at, inspection_units(id, repeat_index_in_sheet, status, passed_code, defect_type, defect_scope))',
    )
    .eq('id', orderId)
    .single();

  if (error) throw error;
  const row = orderUnitsSchema.parse(data);

  const flattened: OrderUnit[] = row.order_sheets.flatMap((sheet) =>
    sheet.inspection_units.map((unit) => ({
      id: unit.id,
      orderSheetId: sheet.id,
      sheetCreatedAt: sheet.created_at,
      colorId: sheet.color_id,
      customHex: sheet.custom_hex,
      sheetRepeats: sheet.repeats,
      repeatIndexInSheet: unit.repeat_index_in_sheet,
      status: unit.status,
      position: 0,
    })),
  );

  flattened.sort(compareUnits);
  flattened.forEach((unit, index) => {
    unit.position = index + 1;
  });

  return {
    orderId: row.id,
    orderCode: row.code,
    proofPhotoPath: row.proof_photo_url,
    units: flattened,
    total: flattened.length,
    passed: flattened.filter((unit) => unit.status === 'passed').length,
    returned: flattened.filter((unit) => unit.status === 'returned').length,
    pending: flattened.filter((unit) => unit.status === 'pending').length,
  };
}

/**
 * The navigation primitive of this whole module: after every decision, where
 * does the QA person go next?
 *
 * One shared implementation on purpose — re-deriving "next pending unit" on
 * each screen is how the pass path and the return path end up disagreeing
 * about the order units are reviewed in.
 */
export async function findFirstPendingUnit(orderId: string): Promise<OrderUnit | null> {
  const { units } = await getOrderUnits(orderId);
  return units.find((unit) => unit.status === 'pending') ?? null;
}

// --- Decisions --------------------------------------------------------------

/** `{orderCode}-R{position}` — the code stencilled onto the physical repeat. */
export function passedCodeFor(orderCode: string, position: number): string {
  return `${orderCode}-R${position}`;
}

export async function passUnit(args: {
  unitId: string;
  orderCode: string;
  position: number;
  inspectedBy: string;
}): Promise<string> {
  const passedCode = passedCodeFor(args.orderCode, args.position);

  const { error } = await supabase
    .from('inspection_units')
    .update({
      status: 'passed',
      passed_code: passedCode,
      inspected_by: args.inspectedBy,
      inspected_at: new Date().toISOString(),
    })
    .eq('id', args.unitId);

  if (error) throw error;
  return passedCode;
}

export interface ReturnUnitArgs {
  factoryId: string;
  orderId: string;
  unitId: string;
  orderSheetId: string;
  defectType: DefectType;
  defectScope: DefectScope;
  /** Local URI from the camera; uploaded here. */
  photoUri: string;
  inspectedBy: string;
}

/** Number of units actually returned — 1 for a repeat, N for a whole sheet. */
export async function returnUnit(args: ReturnUnitArgs): Promise<number> {
  const defectPhotoUrl = await uploadPhoto({
    bucket: BUCKETS.defectPhotos,
    factoryId: args.factoryId,
    folder: args.orderId,
    uri: args.photoUri,
    name: args.unitId,
  });

  const patch = {
    status: 'returned' as const,
    defect_type: args.defectType,
    defect_photo_url: defectPhotoUrl,
    defect_scope: args.defectScope,
    inspected_by: args.inspectedBy,
    inspected_at: new Date().toISOString(),
  };

  // Whole-sheet returns go out as one batched update covering every still
  // pending unit on the sheet — including this one — rather than a write per
  // repeat. The stage/alert trigger fires per row either way.
  const query =
    args.defectScope === 'sheet'
      ? supabase
          .from('inspection_units')
          .update(patch)
          .eq('order_sheet_id', args.orderSheetId)
          .eq('status', 'pending')
      : supabase.from('inspection_units').update(patch).eq('id', args.unitId);

  const { data, error } = await query.select('id');
  if (error) throw error;

  return data?.length ?? 0;
}
