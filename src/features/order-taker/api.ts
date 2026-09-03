import { randomUUID } from 'expo-crypto';
import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import {
  uuid,
  orderStageSchema,
  orderStatusSchema,
  unitStatusSchema,
  type OrderStatus,
} from '../../data/types';
import type { NewClientDraft, SheetDraft } from './wizardStore';

/**
 * Read/write helpers for the Order Taker module.
 *
 * Every read is parsed through a Zod schema so a schema change fails here, at
 * the boundary, rather than three screens deep in a render.
 */

// --- Orders list ------------------------------------------------------------

const orderListRowSchema = z.object({
  id: uuid(),
  code: z.string(),
  status: orderStatusSchema,
  stage: orderStageSchema,
  created_at: z.string(),
  clients: z.object({ name: z.string() }).nullable(),
  order_sheets: z.array(
    z.object({ color_id: z.string(), custom_hex: z.string().nullable() }),
  ),
  inspection_units: z.array(z.object({ status: unitStatusSchema })),
});

export type OrderListRow = z.infer<typeof orderListRowSchema>;

export type OrderFilter = 'all' | OrderStatus;

/**
 * The order taker's own queue.
 *
 * Scoped to `created_by` as well as `factory_id`: RLS already stops the
 * cross-factory case, but a taker's list should show the orders they took, not
 * every order in the factory.
 */
export async function listOrders(
  factoryId: string,
  createdBy: string,
  filter: OrderFilter,
): Promise<OrderListRow[]> {
  let query = supabase
    .from('orders')
    .select(
      'id, code, status, stage, created_at, clients(name), order_sheets(color_id, custom_hex), inspection_units(status)',
    )
    .eq('factory_id', factoryId)
    .eq('created_by', createdBy)
    .order('created_at', { ascending: false });

  if (filter !== 'all') query = query.eq('status', filter);

  const { data, error } = await query;
  if (error) throw error;
  return z.array(orderListRowSchema).parse(data);
}

/** "4 of 12 checked" for a running order; the date for anything else. */
export function orderMetaText(row: OrderListRow): string {
  if (row.status === 'in_progress' && row.inspection_units.length > 0) {
    const checked = row.inspection_units.filter((u) => u.status !== 'pending').length;
    return `${checked} of ${row.inspection_units.length} checked`;
  }
  return new Date(row.created_at).toLocaleDateString();
}

// --- Order detail -----------------------------------------------------------

const orderDetailSchema = z.object({
  id: uuid(),
  code: z.string(),
  status: orderStatusSchema,
  stage: orderStageSchema,
  proof_photo_url: z.string().nullable(),
  design_sheet_photo_url: z.string().nullable(),
  alert_text: z.string().nullable(),
  created_at: z.string(),
  client_id: uuid(),
  clients: z
    .object({
      name: z.string(),
      phone: z.string(),
      photo_url: z.string().nullable(),
    })
    .nullable(),
  order_sheets: z.array(
    z.object({
      id: uuid(),
      color_id: z.string(),
      custom_hex: z.string().nullable(),
      repeats: z.number().int().positive(),
    }),
  ),
});

export type OrderDetail = z.infer<typeof orderDetailSchema>;

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, code, status, stage, proof_photo_url, design_sheet_photo_url, alert_text, created_at, client_id, clients(name, phone, photo_url), order_sheets(id, color_id, custom_hex, repeats)',
    )
    .eq('id', orderId)
    .single();

  if (error) throw error;
  return orderDetailSchema.parse(data);
}

/** Clears the alert banner once the order taker has dealt with it. */
export async function resolveOrderAlert(orderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ alert_text: null })
    .eq('id', orderId);
  if (error) throw error;
}

// --- Clients ----------------------------------------------------------------

const clientPickerSchema = z.object({
  id: uuid(),
  name: z.string(),
  phone: z.string(),
  photo_url: z.string().nullable(),
});

export type ClientPickerRow = z.infer<typeof clientPickerSchema>;

export async function listClients(factoryId: string): Promise<ClientPickerRow[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, phone, photo_url')
    .eq('factory_id', factoryId)
    .order('name');

  if (error) throw error;
  return z.array(clientPickerSchema).parse(data);
}

// --- Submit -----------------------------------------------------------------

export interface SubmitOrderArgs {
  factoryId: string;
  /** Set when resuming a draft; a fresh order gets a new id here. */
  resumingOrderId: string | null;
  selectedClientId: string | null;
  newClientDraft: NewClientDraft | null;
  orderPhotoUri: string | null;
  designSheetPhotoUri: string | null;
  sheets: SheetDraft[];
}

export interface SubmitOrderResult {
  orderId: string;
  orderCode: string;
}

const submitResultSchema = z.array(
  z.object({ order_id: uuid(), order_code: z.string() }),
);

/**
 * Upload the photos, then write client + order + sheets in one RPC.
 *
 * The order id is minted here rather than in the database so the proof photo
 * can be filed under it before the row exists. The RPC runs SECURITY INVOKER,
 * so RLS still applies to every write inside it.
 */
export async function submitOrder(args: SubmitOrderArgs): Promise<SubmitOrderResult> {
  const orderId = args.resumingOrderId ?? randomUUID();

  const proofPhotoUrl = args.orderPhotoUri
    ? await uploadPhoto({
        bucket: BUCKETS.sheetProofPhotos,
        factoryId: args.factoryId,
        folder: orderId,
        uri: args.orderPhotoUri,
        name: 'proof',
      })
    : null;

  const designSheetPhotoUrl = args.designSheetPhotoUri
    ? await uploadPhoto({
        bucket: BUCKETS.sheetProofPhotos,
        factoryId: args.factoryId,
        folder: orderId,
        uri: args.designSheetPhotoUri,
        name: 'design-sheet',
      })
    : null;

  let newClient: Record<string, unknown> | null = null;

  if (args.newClientDraft) {
    const clientId = randomUUID();
    const clientPhotoUrl = args.newClientDraft.photoUri
      ? await uploadPhoto({
          bucket: BUCKETS.clientPhotos,
          factoryId: args.factoryId,
          folder: 'clients',
          uri: args.newClientDraft.photoUri,
          name: clientId,
        })
      : null;

    newClient = {
      id: clientId,
      // No name field in the intake flow yet — the phone number is how the
      // floor identifies a walk-in client, so it stands in until one is added.
      name: args.newClientDraft.phone,
      phone: args.newClientDraft.phone,
      photo_url: clientPhotoUrl,
      shop_photo_taken: Boolean(args.newClientDraft.photoUri),
    };
  }

  const { data, error } = await supabase.rpc('submit_order', {
    p_order_id: orderId,
    p_client_id: args.selectedClientId,
    p_new_client: newClient,
    p_proof_photo_url: proofPhotoUrl,
    p_design_sheet_photo_url: designSheetPhotoUrl,
    p_sheets: args.sheets.map((sheet) => ({
      color_id: sheet.colorId,
      custom_hex: sheet.customHex,
      repeats: sheet.repeats,
    })),
  });

  if (error) throw error;

  const [row] = submitResultSchema.parse(data);
  if (!row) throw new Error('submit_order returned no row');

  return { orderId: row.order_id, orderCode: row.order_code };
}
