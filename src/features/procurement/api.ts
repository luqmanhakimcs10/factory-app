import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import { getSwatch } from '../../data/swatches';
import { tillaHex, tillaLabel } from '../../data/tillaSwatches';
import { uuid, poSourceSchema, poStatusSchema, stockTypeSchema, type StockType } from '../../data/types';
import { formatQuantity } from '../../lib/quantityFormat';

/**
 * Reads and the one write for the Procurement module.
 *
 * The module's whole job is to turn a manual purchase order that has
 * quantities and no prices into one that has both, plus the bill it was bought
 * on. That single transition is `submit_procurement_bill`, and it is the only
 * write here — there is deliberately no table-write path (see 0015).
 *
 * Suppliers are read through Company Admin's roster rather than re-queried
 * here. That table has one owner and one schema; a second copy of the query is
 * how the chip row and the roster end up disagreeing about who is still active.
 */

// --- Rows -------------------------------------------------------------------

const poItemSchema = z.object({
  id: uuid(),
  qty: z.number(),
  price: z.number().nullable(),
  is_additional: z.boolean(),
  item_type: stockTypeSchema.nullable(),
  color_id: z.string().nullable(),
  sequin_size_mm: z.number().nullable(),
  sequin_cut_type: z.string().nullable(),
  recommended_supplier: z.object({ name: z.string() }).nullable(),
  stock_items: z
    .object({
      type: stockTypeSchema,
      label: z.string(),
      color_id: z.string().nullable(),
      custom_hex: z.string().nullable(),
      size_mm: z.number().nullable(),
      cut_type: z.string().nullable(),
    })
    .nullable(),
});

const procurementPoSchema = z.object({
  id: uuid(),
  po_number: z.string(),
  status: poStatusSchema,
  source: poSourceSchema,
  date: z.string(),
  submitted_at: z.string().nullable(),
  bill_photo_url: z.string().nullable(),
  actual_supplier: z.object({ id: uuid(), name: z.string() }).nullable(),
  po_items: z.array(poItemSchema),
});

export type ProcurementPo = z.infer<typeof procurementPoSchema>;

const PO_SELECT =
  'id, po_number, status, source, date, submitted_at, bill_photo_url, ' +
  'actual_supplier:actual_supplier_id(id, name), ' +
  'po_items(id, qty, price, is_additional, item_type, color_id, sequin_size_mm, sequin_cut_type, ' +
  'recommended_supplier:recommended_supplier_id(name), ' +
  'stock_items(type, label, color_id, custom_hex, size_mm, cut_type))';

export async function listProcurementPos(factoryId: string): Promise<ProcurementPo[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(PO_SELECT)
    .eq('factory_id', factoryId)
    .order('date', { ascending: false });

  if (error) throw error;
  return z.array(procurementPoSchema).parse(data);
}

export async function getProcurementPo(purchaseOrderId: string): Promise<ProcurementPo> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(PO_SELECT)
    .eq('id', purchaseOrderId)
    .single();

  if (error) throw error;
  return procurementPoSchema.parse(data);
}

// --- One flattened line, whichever kind of row it came from ------------------

export interface PoLine {
  id: string;
  qty: number;
  price: number | null;
  isAdditional: boolean;
  type: StockType;
  /** "Red", "Antique Gold", "Red · 3mm · Cut", "Bobbin Thread". */
  label: string;
  /** SWATCHES key, or null when the fill comes from `hex`. */
  colorId: string | null;
  hex: string | null;
  sizeMm: number | null;
  /** Only ever set on a requested line, and only when one was suggested. */
  recommendedSupplier: string | null;
}

/** The colour's display name, from whichever palette owns this material. */
function colorLabel(type: StockType, colorId: string | null): string | null {
  if (!colorId) return null;
  return type === 'tilla' ? tillaLabel(colorId) : (getSwatch(colorId)?.label ?? null);
}

/** The fill for a line's swatch. Bobbin has no colour and renders neutral. */
function lineSwatch(
  type: StockType,
  colorId: string | null,
  customHex: string | null,
): { colorId: string | null; hex: string | null } {
  if (type === 'tilla') return { colorId: null, hex: tillaHex(colorId ?? '') ?? customHex };
  if (colorId) return { colorId, hex: customHex };
  return { colorId: null, hex: customHex };
}

/**
 * The compound description.
 *
 * Sequin is the only material whose identity needs three facts — a 3mm cut red
 * and a 5mm flat red are different things on the shelf and cost different
 * money — so it is the only one that composes. Bobbin has no colour at all and
 * says what it is instead of rendering an empty label.
 */
export function lineLabel(
  type: StockType,
  colorId: string | null,
  sizeMm: number | null,
  cutType: string | null,
): string {
  if (type === 'bobbin') return 'Bobbin Thread';

  const color = colorLabel(type, colorId) ?? 'Unspecified';
  if (type !== 'sequin') return color;

  return [color, sizeMm ? `${sizeMm}mm` : null, cutType].filter(Boolean).join(' · ');
}

/**
 * Flatten a `po_items` row into something a row component can render.
 *
 * A requested line describes itself through its `stock_items` join; an
 * additional line has no stock row and carries the same facts on its own
 * columns. Both are resolved here so no screen has to ask which kind it holds.
 */
export function toLine(item: ProcurementPo['po_items'][number]): PoLine {
  const stock = item.stock_items;
  const type = (stock?.type ?? item.item_type ?? 'thread') as StockType;
  const colorId = stock?.color_id ?? item.color_id;
  const sizeMm = stock?.size_mm ?? item.sequin_size_mm;
  const cutType = stock?.cut_type ?? item.sequin_cut_type;

  return {
    id: item.id,
    qty: item.qty,
    price: item.price,
    isAdditional: item.is_additional,
    type,
    label: lineLabel(type, colorId, sizeMm, cutType),
    ...lineSwatch(type, colorId, stock?.custom_hex ?? null),
    sizeMm,
    recommendedSupplier: item.recommended_supplier?.name ?? null,
  };
}

export function poLines(po: ProcurementPo): PoLine[] {
  return po.po_items.map(toLine);
}

/** The quantity line under a description — grams, reels-with-pieces, or pieces. */
export function lineQuantity(line: PoLine): string {
  return formatQuantity(line.type, line.qty, line.sizeMm);
}

/**
 * The live total.
 *
 * Summed from the lines every time rather than stored, for the same reason
 * `total_receivable` is not a column: a total that disagrees with its own line
 * items and says nothing about it is worse than no total.
 */
export function linesTotal(lines: { price: number | null }[]): number {
  return lines.reduce((sum, line) => sum + (line.price ?? 0), 0);
}

// --- The one write ----------------------------------------------------------

export interface AdditionalItemInput {
  itemType: StockType;
  colorId: string | null;
  sequinSizeMm: number | null;
  sequinCutType: string | null;
  qty: number;
  price: number;
}

/**
 * Price the requested lines, add whatever else was bought, submit the bill.
 *
 * Photo first, then the RPC — the same ordering as the Store Manager's issue
 * handoff, and for the same reason: the function re-checks every precondition
 * server-side, so an orphaned upload is a cheaper failure than a status change
 * with no bill behind it.
 */
export async function submitProcurementBill(args: {
  factoryId: string;
  purchaseOrderId: string;
  actualSupplierId: string;
  billPhotoUri: string;
  itemPrices: { id: string; price: number }[];
  additionalItems: AdditionalItemInput[];
}): Promise<void> {
  const billPhotoUrl = await uploadPhoto({
    bucket: BUCKETS.billPhotos,
    factoryId: args.factoryId,
    folder: args.purchaseOrderId,
    uri: args.billPhotoUri,
    name: 'bill',
  });

  const { error } = await supabase.rpc('submit_procurement_bill', {
    p_purchase_order_id: args.purchaseOrderId,
    p_actual_supplier_id: args.actualSupplierId,
    p_bill_photo_url: billPhotoUrl,
    p_item_prices: args.itemPrices,
    p_additional_items: args.additionalItems.map((item) => ({
      item_type: item.itemType,
      color_id: item.colorId,
      sequin_size_mm: item.sequinSizeMm,
      sequin_cut_type: item.sequinCutType,
      qty: item.qty,
      price: item.price,
    })),
  });

  if (error) throw error;
}

/** Store Manager's side of the same PO. Kept here beside the RPC it mirrors. */
export async function confirmPurchaseOrder(purchaseOrderId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_purchase_order', {
    p_purchase_order_id: purchaseOrderId,
  });
  if (error) throw error;
}
