import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import { STAGE_DEFS, type StageKey } from '../../data/stageDefs';
import { hoursLeftFrom, slaLevel } from '../../components/SlaStrip';
import { uuid, defectTypeSchema, sheetStageSchema } from '../../data/types';
import { repeatCodes } from '../floor-manager/api';

/**
 * Reads and writes for the Delivery Person module.
 *
 * Three flows share this file because they share a subject: where a physical
 * repeat currently is. Sheets Movement tracks it out to a finishing partner and
 * back, Order Delivery tracks it out to the client, Order Return tracks the
 * damaged ones back again. Splitting them per screen would put the same
 * `repeat_code` join in three files.
 *
 * Every status transition goes through one of the four `0013` RPCs rather than
 * a table write — there is deliberately no UPDATE policy on `movements` or
 * `return_requests`, so a direct update would fail silently under RLS rather
 * than loudly here.
 */

// --- Movements --------------------------------------------------------------

const movementStatusSchema = z.enum(['ready', 'atPartner', 'returned']);
export type MovementStatus = z.infer<typeof movementStatusSchema>;

const movementSchema = z.object({
  id: uuid(),
  status: movementStatusSchema,
  stage: z.enum(['clipping', 'piko', 'press']),
  codes: z.array(z.string()),
  sla_hours: z.number(),
  sent_at: z.string().nullable(),
  returned_at: z.string().nullable(),
  damaged_count: z.number().int(),
  drop_off_photo_url: z.string().nullable(),
  pickup_photo_url: z.string().nullable(),
  finishing_partners: z.object({ name: z.string() }).nullable(),
  orders: z.object({ code: z.string() }).nullable(),
});

export type Movement = z.infer<typeof movementSchema>;

const MOVEMENT_SELECT =
  'id, status, stage, codes, sla_hours, sent_at, returned_at, damaged_count, ' +
  'drop_off_photo_url, pickup_photo_url, ' +
  'finishing_partners(name), orders(code)';

export async function listMovements(factoryId: string): Promise<Movement[]> {
  const { data, error } = await supabase
    .from('movements')
    .select(MOVEMENT_SELECT)
    .eq('factory_id', factoryId)
    // Newest first within a tab. `sent_at` is null until drop-off, which is
    // why 0013 added `created_at` — it is the only key every row has.
    .order('created_at', { ascending: false });

  if (error) throw error;
  return z.array(movementSchema).parse(data);
}

export async function getMovement(movementId: string): Promise<Movement> {
  const { data, error } = await supabase
    .from('movements')
    .select(MOVEMENT_SELECT)
    .eq('id', movementId)
    .single();

  if (error) throw error;
  return movementSchema.parse(data);
}

/** Partner name, order code and stage label — the three lines every card shows. */
export function movementTitle(movement: Movement): string {
  return movement.finishing_partners?.name ?? 'Unknown partner';
}

export function movementSubtitle(movement: Movement): string {
  const code = movement.orders?.code ?? '—';
  return `${code} · ${STAGE_DEFS[movement.stage as StageKey].label}`;
}

/** Hours left against this movement's own snapshotted SLA. */
export function movementHoursLeft(movement: Movement): number {
  return hoursLeftFrom(movement.sent_at, movement.sla_hours);
}

/** True once a movement at a partner is past the turnaround it was sent on. */
export function isOverdue(movement: Movement): boolean {
  return movement.status === 'atPartner' && slaLevel(movementHoursLeft(movement)) === 'late';
}

// --- Order delivery ---------------------------------------------------------

const deliveryOrderSchema = z.object({
  id: uuid(),
  code: z.string(),
  delivered_at: z.string().nullable(),
  delivery_photo_url: z.string().nullable(),
  delivery_signature_name: z.string().nullable(),
  clients: z
    .object({
      name: z.string(),
      phone: z.string(),
      photo_url: z.string().nullable(),
      address: z.string().nullable(),
    })
    .nullable(),
  order_sheets: z.array(
    z.object({
      id: uuid(),
      color_id: z.string(),
      custom_hex: z.string().nullable(),
      repeats: z.number().int(),
      stage: sheetStageSchema.nullable(),
    }),
  ),
});

export type DeliveryOrder = z.infer<typeof deliveryOrderSchema>;

const DELIVERY_SELECT =
  'id, code, delivered_at, delivery_photo_url, delivery_signature_name, ' +
  'clients(name, phone, photo_url, address), ' +
  'order_sheets(id, color_id, custom_hex, repeats, stage)';

/**
 * Orders this factory either still has to deliver, or delivered already.
 *
 * "Ready to deliver" is every sheet at `stage = 'ready'` and nothing delivered
 * yet — the same condition the Accountant's Receivables tab used to invoice on
 * before `0013` moved that trigger to delivery itself. The condition did not
 * become wrong, it moved: production-complete is what makes an order ready to
 * *go out*, and going out is what makes it payable.
 */
export async function listDeliveryOrders(factoryId: string): Promise<DeliveryOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(DELIVERY_SELECT)
    .eq('factory_id', factoryId)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return z.array(deliveryOrderSchema).parse(data);
}

export async function getDeliveryOrder(orderId: string): Promise<DeliveryOrder> {
  const { data, error } = await supabase
    .from('orders')
    .select(DELIVERY_SELECT)
    .eq('id', orderId)
    .single();

  if (error) throw error;
  return deliveryOrderSchema.parse(data);
}

export function isReadyToDeliver(order: DeliveryOrder): boolean {
  return (
    order.delivered_at === null &&
    order.order_sheets.length > 0 &&
    order.order_sheets.every((sheet) => sheet.stage === 'ready')
  );
}

/** The repeat codes on one sheet, derived the same way Floor Manager derives them. */
export function sheetCodes(order: DeliveryOrder, sheetIndex: number): string[] {
  const sheet = order.order_sheets[sheetIndex];
  return sheet ? repeatCodes(order.code, sheetIndex, sheet.repeats) : [];
}

// --- Returns ----------------------------------------------------------------

const returnStatusSchema = z.enum(['pending', 'returned']);

const returnRequestSchema = z.object({
  id: uuid(),
  status: returnStatusSchema,
  raised_at: z.string(),
  returned_at: z.string().nullable(),
  return_photo_url: z.string().nullable(),
  orders: z.object({ code: z.string(), clients: z.object({ name: z.string() }).nullable() }).nullable(),
  return_request_sheets: z.array(
    z.object({
      id: uuid(),
      repeat_code: z.string(),
      defect_type: defectTypeSchema,
      flagged: z.object({ full_name: z.string() }).nullable(),
    }),
  ),
});

export type ReturnRequest = z.infer<typeof returnRequestSchema>;

const RETURN_SELECT =
  'id, status, raised_at, returned_at, return_photo_url, ' +
  'orders(code, clients(name)), ' +
  'return_request_sheets(id, repeat_code, defect_type, flagged:flagged_by(full_name))';

export async function listReturnRequests(factoryId: string): Promise<ReturnRequest[]> {
  const { data, error } = await supabase
    .from('return_requests')
    .select(RETURN_SELECT)
    .eq('factory_id', factoryId)
    .order('raised_at', { ascending: false });

  if (error) throw error;
  return z.array(returnRequestSchema).parse(data);
}

export async function getReturnRequest(returnRequestId: string): Promise<ReturnRequest> {
  const { data, error } = await supabase
    .from('return_requests')
    .select(RETURN_SELECT)
    .eq('id', returnRequestId)
    .single();

  if (error) throw error;
  return returnRequestSchema.parse(data);
}

// --- Photo upload -----------------------------------------------------------

/**
 * One bucket for every proof photo these flows attach — see `0016`.
 *
 * The `name` prefix is what tells a drop-off photo from a pickup photo when
 * somebody opens the bucket, and nothing else depends on it: the column the
 * path lands in is decided by which RPC is called, not by the filename.
 */
export async function uploadProof(
  factoryId: string,
  uri: string,
  name: string,
): Promise<string> {
  return uploadPhoto({ bucket: BUCKETS.staffProofPhotos, factoryId, uri, name });
}

// --- Writes: the four RPCs from 0013 ----------------------------------------

export async function confirmDropOff(movementId: string, photoUrl: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_drop_off', {
    p_movement_id: movementId,
    p_photo_url: photoUrl,
  });
  if (error) throw error;
}

export async function confirmPickup(
  movementId: string,
  photoUrl: string,
  damagedCodes: string[],
): Promise<void> {
  const { error } = await supabase.rpc('confirm_pickup', {
    p_movement_id: movementId,
    p_photo_url: photoUrl,
    p_damaged_codes: damagedCodes,
  });
  if (error) throw error;
}

export async function markDelivered(
  orderId: string,
  photoUrl: string,
  signatureName: string,
): Promise<void> {
  const { error } = await supabase.rpc('mark_delivered', {
    p_order_id: orderId,
    p_photo_url: photoUrl,
    p_signature_name: signatureName,
  });
  if (error) throw error;
}

export async function confirmReturn(returnRequestId: string, photoUrl: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_return', {
    p_return_request_id: returnRequestId,
    p_photo_url: photoUrl,
  });
  if (error) throw error;
}

// --- Dashboard counts -------------------------------------------------------

export interface DashboardCounts {
  ordersOpen: number;
  movementsReady: number;
  movementsOut: number;
  movementsOverdue: number;
  toDeliver: number;
  toReturn: number;
  posToBuy: number;
}

/**
 * Every stat line on the Dashboard, in one round trip per grant held.
 *
 * Counted rather than listed: the cards show a figure, and pulling whole rows
 * to call `.length` on them is the difference between a dashboard that opens
 * instantly and one that waits on the largest table in the factory. Queries for
 * grants the person does not hold are never issued at all — an ungranted count
 * would be a read they are not entitled to make, and RLS would be the only
 * thing stopping it.
 */
export async function loadDashboardCounts(
  factoryId: string,
  profileId: string,
  grants: readonly string[],
): Promise<DashboardCounts> {
  const counts: DashboardCounts = {
    ordersOpen: 0,
    movementsReady: 0,
    movementsOut: 0,
    movementsOverdue: 0,
    toDeliver: 0,
    toReturn: 0,
    posToBuy: 0,
  };

  const jobs: Promise<void>[] = [];

  if (grants.includes('orderTaking')) {
    jobs.push(
      (async () => {
        const { count, error } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('factory_id', factoryId)
          .eq('created_by', profileId)
          .neq('status', 'completed');
        if (error) throw error;
        counts.ordersOpen = count ?? 0;
      })(),
    );
  }

  if (grants.includes('sheetMovement')) {
    jobs.push(
      (async () => {
        // Rows, not counts: "overdue" is computed from `sent_at + sla_hours`
        // against the clock, which Postgrest cannot filter on without a view.
        const movements = await listMovements(factoryId);
        counts.movementsReady = movements.filter((m) => m.status === 'ready').length;
        counts.movementsOut = movements.filter((m) => m.status === 'atPartner').length;
        counts.movementsOverdue = movements.filter(isOverdue).length;
      })(),
    );
  }

  if (grants.includes('orderDelivery')) {
    jobs.push(
      (async () => {
        const orders = await listDeliveryOrders(factoryId);
        counts.toDeliver = orders.filter(isReadyToDeliver).length;
      })(),
    );
  }

  if (grants.includes('orderReturn')) {
    jobs.push(
      (async () => {
        const { count, error } = await supabase
          .from('return_requests')
          .select('id', { count: 'exact', head: true })
          .eq('factory_id', factoryId)
          .eq('status', 'pending');
        if (error) throw error;
        counts.toReturn = count ?? 0;
      })(),
    );
  }

  if (grants.includes('procurePo')) {
    jobs.push(
      (async () => {
        const { count, error } = await supabase
          .from('purchase_orders')
          .select('id', { count: 'exact', head: true })
          .eq('factory_id', factoryId)
          .eq('status', 'awaitingProcurement')
          .eq('source', 'manual');
        if (error) throw error;
        counts.posToBuy = count ?? 0;
      })(),
    );
  }

  await Promise.all(jobs);
  return counts;
}
