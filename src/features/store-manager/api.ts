import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import { tillaHex } from '../../data/tillaSwatches';
import {
  uuid,
  materialEntrySchema,
  poSourceSchema,
  poStatusSchema,
  stockItemSchema,
  type PoStatus,
  type StockItem,
  type StockType,
} from '../../data/types';

/**
 * Reads and writes for the Store Manager module.
 *
 * Four tabs over four mostly-independent tables, plus the one cross-module
 * write: flipping an order from `materialRequested` to `readyToCollect`.
 */

// --- Stock ------------------------------------------------------------------

export async function listStockItems(
  factoryId: string,
  stockType: StockType,
  search: string,
): Promise<StockItem[]> {
  let query = supabase
    .from('stock_items')
    .select(
      'id, factory_id, type, code, label, color_id, custom_hex, quantity_grams, size_mm, cut_type, roll_count, piece_count, low_stock_threshold, created_at',
    )
    .eq('factory_id', factoryId)
    .eq('type', stockType)
    .order('code');

  const trimmed = search.trim();
  if (trimmed) query = query.ilike('code', `%${trimmed}%`);

  const { data, error } = await query;
  if (error) throw error;
  return z.array(stockItemSchema).parse(data);
}

/**
 * Whether an item is below its threshold.
 *
 * Computed here rather than stored: thread and tilla are measured in grams,
 * sequin in rolls, and one generated column cannot cover both. An item with no
 * threshold set is never low.
 */
export function isLowStock(item: StockItem): boolean {
  if (item.low_stock_threshold === null) return false;
  const level = item.type === 'sequin' ? item.roll_count : item.quantity_grams;
  return level !== null && level < item.low_stock_threshold;
}

/** Sequin rows carry a compound label; everything else uses its own. */
export function stockLabel(item: StockItem): string {
  if (item.type !== 'sequin') return item.label;
  return [item.label, item.size_mm ? `${item.size_mm}mm` : null, item.cut_type]
    .filter(Boolean)
    .join(' · ');
}

export function stockQuantity(item: StockItem): string {
  if (item.type === 'sequin') {
    return item.roll_count === null ? '—' : `${item.roll_count} CDs`;
  }
  return item.quantity_grams === null
    ? '—'
    : `${item.quantity_grams.toLocaleString()} g`;
}

/**
 * The sequin piece count, which is always derived from the roll count and never
 * typed in. The conversion factor is not available yet, so this reports the
 * absence rather than inventing a number.
 */
export function stockComputedQuantity(item: StockItem): string | undefined {
  if (item.type !== 'sequin') return undefined;
  return item.piece_count === null
    ? 'Pieces: pending conversion table'
    : `${item.piece_count.toLocaleString()} pieces (computed)`;
}

/** Fill for a stock row: SWATCHES key, tilla shade, or a stored hex. */
export function stockSwatch(item: StockItem): { colorId: string | null; hex: string | null } {
  if (item.type === 'tilla') {
    return { colorId: null, hex: tillaHex(item.color_id ?? '') ?? item.custom_hex };
  }
  if (item.color_id) return { colorId: item.color_id, hex: item.custom_hex };
  return { colorId: null, hex: item.custom_hex };
}

// --- Purchase orders --------------------------------------------------------

const purchaseOrderSchema = z.object({
  id: uuid(),
  po_number: z.string(),
  status: poStatusSchema,
  source: poSourceSchema,
  supplier_name: z.string().nullable(),
  date: z.string(),
  po_items: z.array(
    z.object({
      id: uuid(),
      qty: z.number(),
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
});

export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

export async function listPurchaseOrders(factoryId: string): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(
      'id, po_number, status, source, supplier_name, date, po_items(id, qty, stock_items(type, label, color_id, custom_hex))',
    )
    .eq('factory_id', factoryId)
    .order('date', { ascending: false });

  if (error) throw error;
  return z.array(purchaseOrderSchema).parse(data);
}

/**
 * Which statuses count as an open PO for the tab badge.
 *
 * Only the first two appear in the source screenshots; `confirmed` and
 * `received` are inferred, and are assumed terminal here.
 */
const OPEN_PO_STATUSES: PoStatus[] = ['awaitingProcurement', 'awaitingConfirmation'];

export function isOpenPo(po: PurchaseOrder): boolean {
  return OPEN_PO_STATUSES.includes(po.status);
}

/** Swatches for a PO card, resolved the same way stock rows resolve theirs. */
export function poSwatches(po: PurchaseOrder) {
  return po.po_items
    .map((item) => item.stock_items)
    .filter((stock): stock is NonNullable<typeof stock> => stock !== null)
    .map((stock) =>
      stock.type === 'tilla'
        ? { colorId: null, hex: tillaHex(stock.color_id ?? '') ?? stock.custom_hex }
        : { colorId: stock.color_id, hex: stock.custom_hex },
    );
}

// --- Issue ------------------------------------------------------------------

const issueOrderSchema = z.object({
  id: uuid(),
  code: z.string(),
  design_code: z.string().nullable(),
  floor_status: z.enum(['materialRequested', 'readyToCollect']),
  materials: z.array(materialEntrySchema).nullable(),
  issued_date: z.string().nullable(),
  clients: z.object({ name: z.string() }).nullable(),
  issued_profile: z.object({ full_name: z.string() }).nullable(),
});

export type IssueOrder = z.infer<typeof issueOrderSchema>;

const ISSUE_SELECT =
  'id, code, design_code, floor_status, materials, issued_date, clients(name), issued_profile:issued_by(full_name)';

export interface IssueQueue {
  readyToIssue: IssueOrder[];
  issuedThisWeek: IssueOrder[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The Issue tab's two lists.
 *
 * A store manager can only see orders in these two statuses at all — see the
 * restrictive policy in 0008 — so "Issued This Week" holds an order until the
 * floor manager collects it, not for a fixed seven days.
 */
export async function getIssueQueue(factoryId: string): Promise<IssueQueue> {
  const { data, error } = await supabase
    .from('orders')
    .select(ISSUE_SELECT)
    .eq('factory_id', factoryId)
    .in('floor_status', ['materialRequested', 'readyToCollect'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = z.array(issueOrderSchema).parse(data);
  const cutoff = Date.now() - WEEK_MS;

  return {
    readyToIssue: rows.filter((row) => row.floor_status === 'materialRequested'),
    issuedThisWeek: rows.filter(
      (row) =>
        row.floor_status === 'readyToCollect' &&
        row.issued_date !== null &&
        new Date(row.issued_date).getTime() >= cutoff,
    ),
  };
}

export async function getIssueOrder(orderId: string): Promise<IssueOrder> {
  const { data, error } = await supabase
    .from('orders')
    .select(ISSUE_SELECT)
    .eq('id', orderId)
    .single();

  if (error) throw error;
  return issueOrderSchema.parse(data);
}

/**
 * Hand the materials over.
 *
 * Photo first, then the RPC — the function rejects an order that is not
 * actually waiting, so a stray upload is preferable to a state change that
 * happened without one.
 */
export async function issueOrderMaterials(args: {
  factoryId: string;
  orderId: string;
  photoUri: string;
}): Promise<void> {
  await uploadPhoto({
    bucket: BUCKETS.issuePhotos,
    factoryId: args.factoryId,
    folder: args.orderId,
    uri: args.photoUri,
    name: 'issue-proof',
  });

  const { error } = await supabase.rpc('issue_order_materials', {
    p_order_id: args.orderId,
  });
  if (error) throw error;
}

// --- Audit ------------------------------------------------------------------

const auditRecordSchema = z.object({
  id: uuid(),
  date: z.string(),
  items_checked: z.number().int(),
  items_matched: z.number().int(),
  variance_count: z.number().int(),
});

export type AuditRecord = z.infer<typeof auditRecordSchema>;

export async function listAuditRecords(factoryId: string): Promise<AuditRecord[]> {
  const { data, error } = await supabase
    .from('audit_records')
    .select('id, date, items_checked, items_matched, variance_count')
    .eq('factory_id', factoryId)
    .order('date', { ascending: false });

  if (error) throw error;
  return z.array(auditRecordSchema).parse(data);
}
