import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { BUCKETS, uploadPhoto } from '../../data/storage';
import { tillaHex } from '../../data/tillaSwatches';
import {
  uuid,
  materialEntrySchema,
  poSourceSchema,
  poStatusSchema,
  stockTypeSchema,
  type PoStatus,
  type StockType,
} from '../../data/types';

/**
 * Reads and writes for the Store Manager module.
 *
 * Stock is lot-based (0018). A code's quantity is never stored: it is the sum
 * of its open lots, and every outgoing movement drains the oldest lot first.
 * The drain itself happens server-side inside each RPC — `fifoPlan` here is a
 * preview of the same rule, so a screen can say which lots a draw will touch
 * before it happens. Every write is an RPC; there is no table-write path.
 */

// --- Types of stock -----------------------------------------------------------

export interface TypeMeta {
  label: string;
  unit: string;
  unitPl: string;
  /** Lots of this type carry a yards-per-unit figure. */
  hasYards: boolean;
  /** Low-stock line when a code has no threshold of its own. */
  defaultLow: number;
}

export const STOCK_TYPES: StockType[] = ['thread', 'tilla', 'sequin', 'bobbin'];

export const TYPE_META: Record<StockType, TypeMeta> = {
  thread: { label: 'Thread', unit: 'cone', unitPl: 'cones', hasYards: true, defaultLow: 4 },
  tilla: { label: 'Tilla', unit: 'g', unitPl: 'g', hasYards: false, defaultLow: 2000 },
  sequin: { label: 'Sequin', unit: 'CD', unitPl: 'CDs', hasYards: true, defaultLow: 3 },
  bobbin: { label: 'Bobbin', unit: 'bobbin', unitPl: 'bobbins', hasYards: false, defaultLow: 60 },
};

export const fmt = (n: number) => Number(n).toLocaleString('en-US');

/** "2026-09-14". A `date` column passes through; a timestamp becomes its local day. */
export function isoDay(value: string | null): string {
  if (!value) return '—';
  if (value.length === 10) return value;
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function unitsLabel(type: StockType, qty: number): string {
  const meta = TYPE_META[type];
  return `${fmt(qty)} ${qty === 1 ? meta.unit : meta.unitPl}`;
}

// --- Stock book: codes + lots -------------------------------------------------

const stockCodeSchema = z.object({
  id: uuid(),
  type: stockTypeSchema,
  code: z.string(),
  label: z.string(),
  color_id: z.string().nullable(),
  custom_hex: z.string().nullable(),
  size_mm: z.number().nullable(),
  cut_type: z.string().nullable(),
  low_stock_threshold: z.number().nullable(),
});
export type StockCode = z.infer<typeof stockCodeSchema>;

const partySchema = z.object({ id: uuid(), name: z.string(), kind: z.enum(['supplier', 'factory']) });
export type Party = z.infer<typeof partySchema>;

const lotSchema = z.object({
  id: uuid(),
  stock_item_id: uuid(),
  qty: z.number(),
  unit_yards: z.number().nullable(),
  price: z.number().nullable(),
  received_at: z.string(),
  created_at: z.string(),
  party: partySchema,
});
export type Lot = z.infer<typeof lotSchema>;

export interface StockBook {
  codes: StockCode[];
  lots: Lot[];
}

export async function getStockBook(factoryId: string): Promise<StockBook> {
  const [codes, lots] = await Promise.all([
    supabase
      .from('stock_items')
      .select('id, type, code, label, color_id, custom_hex, size_mm, cut_type, low_stock_threshold')
      .eq('factory_id', factoryId)
      .order('code'),
    supabase
      .from('stock_lots')
      .select('id, stock_item_id, qty, unit_yards, price, received_at, created_at, party:party_id(id, name, kind)')
      .eq('factory_id', factoryId),
  ]);
  if (codes.error) throw codes.error;
  if (lots.error) throw lots.error;
  return {
    codes: z.array(stockCodeSchema).parse(codes.data),
    lots: z.array(lotSchema).parse(lots.data),
  };
}

/** Every lot of a code, oldest first — the order FIFO drains them in. */
export function lotsOf(book: StockBook, itemId: string): Lot[] {
  return book.lots
    .filter((lot) => lot.stock_item_id === itemId)
    .sort((a, b) =>
      a.received_at === b.received_at
        ? a.created_at.localeCompare(b.created_at)
        : a.received_at.localeCompare(b.received_at),
    );
}

export function openLotsOf(book: StockBook, itemId: string): Lot[] {
  return lotsOf(book, itemId).filter((lot) => lot.qty > 0);
}

export function onHand(book: StockBook, itemId: string): number {
  return openLotsOf(book, itemId).reduce((sum, lot) => sum + lot.qty, 0);
}

export function onHandYards(book: StockBook, itemId: string): number {
  return openLotsOf(book, itemId).reduce((sum, lot) => sum + lot.qty * (lot.unit_yards ?? 0), 0);
}

export type StockStatus = 'in' | 'low' | 'empty';

export function stockStatus(book: StockBook, code: StockCode): StockStatus {
  const qty = onHand(book, code.id);
  if (qty === 0) return 'empty';
  const threshold = code.low_stock_threshold ?? TYPE_META[code.type].defaultLow;
  return qty < threshold ? 'low' : 'in';
}

/** "26 cones · 66,150 yd" */
export function qtyLine(book: StockBook, code: StockCode): string {
  const line = unitsLabel(code.type, onHand(book, code.id));
  return TYPE_META[code.type].hasYards
    ? `${line} · ${fmt(onHandYards(book, code.id))} yd`
    : line;
}

export interface PlanStep {
  lotId: string;
  party: string;
  take: number;
}

/** Preview of the server's drain: which lots a draw of `qty` would touch. */
export function fifoPlan(book: StockBook, itemId: string, qty: number) {
  let left = qty;
  const plan: PlanStep[] = [];
  for (const lot of openLotsOf(book, itemId)) {
    if (left <= 0) break;
    const take = Math.min(lot.qty, left);
    plan.push({ lotId: lot.id, party: lot.party.name, take });
    left -= take;
  }
  return { plan, short: Math.max(0, left) };
}

/** "101@Al-Rehman Threads + 101@Zaman Textiles" — whose stock a draw took. */
export function lotIdentity(code: string, parties: string[]): string {
  return parties.length ? parties.map((party) => `${code}@${party}`).join('  +  ') : `${code}@—`;
}

/** Fill for a code's swatch: SWATCHES key, tilla shade, or a stored hex. */
export function codeSwatch(code: StockCode): { colorId: string | null; hex: string | null } {
  if (code.type === 'tilla') return { colorId: null, hex: tillaHex(code.color_id ?? '') ?? code.custom_hex };
  return { colorId: code.color_id, hex: code.custom_hex };
}

// --- Parties ------------------------------------------------------------------

export async function listParties(factoryId: string): Promise<(Party & { status: string })[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, kind, status')
    .eq('factory_id', factoryId)
    .order('name');
  if (error) throw error;
  return z.array(partySchema.extend({ status: z.string() })).parse(data);
}

export async function getBobbinRatio(factoryId: string): Promise<number> {
  const { data, error } = await supabase
    .from('factories')
    .select('bobbin_ratio')
    .eq('id', factoryId)
    .single();
  if (error) throw error;
  return z.object({ bobbin_ratio: z.number() }).parse(data).bobbin_ratio;
}

// --- Item history -------------------------------------------------------------

const moveSchema = z.object({
  id: uuid(),
  qty: z.number(),
  kind: z.enum(['opening', 'po', 'exchange_in', 'exchange_out', 'sale', 'issue', 'return']),
  moved_at: z.string(),
  created_at: z.string(),
  stock_lots: z.object({ party: z.object({ name: z.string() }) }),
  purchase_orders: z.object({ po_number: z.string() }).nullable(),
  sales: z.object({ code: z.string(), customer_name: z.string() }).nullable(),
  exchange_lines: z
    .object({ exchanges: z.object({ code: z.string(), party: z.object({ name: z.string() }) }) })
    .nullable(),
  issue_lines: z
    .object({ orders: z.object({ code: z.string(), job_card_code: z.string().nullable() }).nullable() })
    .nullable(),
  stock_returns: z
    .object({ code: z.string(), orders: z.object({ code: z.string() }).nullable() })
    .nullable(),
});

export interface Movement {
  id: string;
  dir: 'in' | 'out';
  title: string;
  party: string;
  at: string;
  qty: number;
}

export async function getItemHistory(itemId: string): Promise<Movement[]> {
  const { data, error } = await supabase
    .from('stock_moves')
    .select(
      'id, qty, kind, moved_at, created_at, ' +
        'stock_lots!inner(stock_item_id, party:party_id(name)), ' +
        'purchase_orders(po_number), sales(code, customer_name), ' +
        'exchange_lines(exchanges(code, party:party_id(name))), ' +
        'issue_lines(orders(code, job_card_code)), stock_returns(code, orders(code))',
    )
    .eq('stock_lots.stock_item_id', itemId)
    .order('moved_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  return z.array(moveSchema).parse(data).map((move) => ({
    id: move.id,
    dir: move.qty > 0 ? 'in' : 'out',
    title: moveTitle(move),
    party: move.stock_lots.party.name,
    at: move.moved_at,
    qty: Math.abs(move.qty),
  }));
}

function moveTitle(move: z.infer<typeof moveSchema>): string {
  switch (move.kind) {
    case 'opening':
      return 'Opening balance';
    case 'po':
      return `Received into stock · ${move.purchase_orders?.po_number ?? 'PO'}`;
    case 'exchange_in':
      return `Exchange in · ${move.exchange_lines?.exchanges.code ?? ''}`;
    case 'exchange_out':
      return `Exchange out · ${move.exchange_lines?.exchanges.party.name ?? ''}`;
    case 'sale':
      return `Sold · ${move.sales?.customer_name ?? ''}`;
    case 'issue': {
      const order = move.issue_lines?.orders;
      return `Issued to floor · ${order?.job_card_code ?? order?.code ?? ''}`;
    }
    case 'return':
      return `Returned from floor · ${move.stock_returns?.orders?.code ?? move.stock_returns?.code ?? ''}`;
  }
}

// --- Purchase orders ----------------------------------------------------------

const purchaseOrderSchema = z.object({
  id: uuid(),
  po_number: z.string(),
  status: poStatusSchema,
  source: poSourceSchema,
  supplier_name: z.string().nullable(),
  date: z.string(),
  submitted_at: z.string().nullable(),
  confirmed_at: z.string().nullable(),
  bill_photo_url: z.string().nullable(),
  actual_supplier: z.object({ name: z.string() }).nullable(),
  submitter: z.object({ full_name: z.string() }).nullable(),
  po_items: z.array(
    z.object({
      id: uuid(),
      qty: z.number(),
      price: z.number().nullable(),
      ask_yards: z.number().nullable(),
      got_yards: z.number().nullable(),
      is_additional: z.boolean(),
      item_type: stockTypeSchema.nullable(),
      color_id: z.string().nullable(),
      recommended_supplier: z.object({ name: z.string() }).nullable(),
      stock_items: z.object({ code: z.string(), type: stockTypeSchema }).nullable(),
    }),
  ),
});

export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
export type PoItem = PurchaseOrder['po_items'][number];

const PO_SELECT =
  'id, po_number, status, source, supplier_name, date, submitted_at, confirmed_at, bill_photo_url, ' +
  'actual_supplier:actual_supplier_id(name), submitter:submitted_by(full_name), ' +
  'po_items(id, qty, price, ask_yards, got_yards, is_additional, item_type, color_id, ' +
  'recommended_supplier:recommended_supplier_id(name), stock_items(code, type))';

export async function listPurchaseOrders(factoryId: string): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(PO_SELECT)
    .eq('factory_id', factoryId)
    .order('date', { ascending: false });
  if (error) throw error;
  return z.array(purchaseOrderSchema).parse(data);
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data, error } = await supabase.from('purchase_orders').select(PO_SELECT).eq('id', id).single();
  if (error) throw error;
  return purchaseOrderSchema.parse(data);
}

/**
 * The three buckets the Store Manager sees.
 *
 * `submitted` (Procurement fulfilled a manual PO) and `awaitingConfirmation`
 * (a system-generated PO reached the supplier) are one bucket: in both the
 * goods are waiting on this role to confirm receipt, and confirming is what
 * credits stock. `received` is folded into `confirmed` by 0018 and never
 * written again; it maps here only so an old row cannot crash the list.
 */
export type PoBucket = 'awaitingProcurement' | 'awaitingConfirmation' | 'confirmed';

export function poBucket(status: PoStatus): PoBucket {
  if (status === 'awaitingProcurement') return 'awaitingProcurement';
  if (status === 'submitted' || status === 'awaitingConfirmation') return 'awaitingConfirmation';
  return 'confirmed';
}

export const isOpenPo = (po: PurchaseOrder) => poBucket(po.status) !== 'confirmed';

export function poTotal(po: PurchaseOrder): number {
  return po.po_items.reduce((sum, item) => sum + (item.price ?? 0), 0);
}

export function poItemType(item: PoItem): StockType {
  return item.stock_items?.type ?? item.item_type ?? 'thread';
}

/** Same length per unit as asked for? Count can match while yards do not. */
export function isShortYards(item: PoItem): boolean {
  return item.got_yards !== null && item.ask_yards !== null && item.got_yards < item.ask_yards;
}

export interface NewPoItem {
  stockItemId: string;
  qty: number;
  askYards: number | null;
  recommendedSupplierId: string | null;
}

export async function createPurchaseOrder(items: NewPoItem[]): Promise<string> {
  const { data, error } = await supabase.rpc('create_purchase_order', {
    p_items: items.map((item) => ({
      stock_item_id: item.stockItemId,
      qty: item.qty,
      ask_yards: item.askYards,
      recommended_supplier_id: item.recommendedSupplierId,
    })),
  });
  if (error) throw error;
  return z.string().parse(data);
}

// --- Sales --------------------------------------------------------------------

const drawSchema = z.object({
  qty: z.number(),
  stock_lots: z.object({ party: z.object({ name: z.string() }) }),
});

/** A draw's per-party breakdown, merged so two lots of one party read as one. */
export function drawPlan(draws: z.infer<typeof drawSchema>[]): { party: string; take: number }[] {
  const byParty = new Map<string, number>();
  for (const draw of draws) {
    const party = draw.stock_lots.party.name;
    byParty.set(party, (byParty.get(party) ?? 0) + Math.abs(draw.qty));
  }
  return [...byParty].map(([party, take]) => ({ party, take }));
}

const saleSchema = z.object({
  id: uuid(),
  code: z.string(),
  customer_name: z.string(),
  qty: z.number(),
  value: z.number(),
  sold_at: z.string(),
  paid: z.boolean(),
  stock_items: z.object({ code: z.string(), type: stockTypeSchema }),
  stock_moves: z.array(drawSchema),
});
export type Sale = z.infer<typeof saleSchema>;

const SALE_SELECT =
  'id, code, customer_name, qty, value, sold_at, paid, stock_items(code, type), ' +
  'stock_moves(qty, stock_lots(party:party_id(name)))';

export async function listSales(factoryId: string): Promise<Sale[]> {
  const { data, error } = await supabase
    .from('sales')
    .select(SALE_SELECT)
    .eq('factory_id', factoryId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return z.array(saleSchema).parse(data);
}

export async function getSale(id: string): Promise<Sale> {
  const { data, error } = await supabase.from('sales').select(SALE_SELECT).eq('id', id).single();
  if (error) throw error;
  return saleSchema.parse(data);
}

export async function recordSale(args: {
  stockItemId: string;
  qty: number;
  value: number;
  customer: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_sale', {
    p_stock_item_id: args.stockItemId,
    p_qty: args.qty,
    p_value: args.value,
    p_customer_name: args.customer,
  });
  if (error) throw error;
  return z.string().parse(data);
}

export async function markSalePaid(saleId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_sale_paid', { p_sale_id: saleId });
  if (error) throw error;
}

// --- Exchanges ----------------------------------------------------------------

const exchangeSchema = z.object({
  id: uuid(),
  code: z.string(),
  exchanged_at: z.string(),
  party: partySchema,
  exchange_lines: z.array(
    z.object({
      id: uuid(),
      direction: z.enum(['gave', 'got']),
      qty: z.number(),
      value: z.number(),
      stock_items: z.object({ code: z.string(), type: stockTypeSchema }),
    }),
  ),
});
export type Exchange = z.infer<typeof exchangeSchema>;

export async function listExchanges(factoryId: string): Promise<Exchange[]> {
  const { data, error } = await supabase
    .from('exchanges')
    .select(
      'id, code, exchanged_at, party:party_id(id, name, kind), ' +
        'exchange_lines(id, direction, qty, value, stock_items(code, type))',
    )
    .eq('factory_id', factoryId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return z.array(exchangeSchema).parse(data);
}

/** Got minus gave. Informational only — never posted to a ledger. */
export function exchangeDifference(lines: { direction: 'gave' | 'got'; value: number }[]): number {
  return lines.reduce((sum, line) => sum + (line.direction === 'got' ? line.value : -line.value), 0);
}

export interface ExchangeLineInput {
  direction: 'gave' | 'got';
  stockItemId: string;
  qty: number;
  unitYards: number | null;
  value: number;
}

export async function recordExchange(args: {
  factoryId: string;
  partyId: string;
  photoUri: string;
  lines: ExchangeLineInput[];
}): Promise<string> {
  const photoUrl = await uploadPhoto({
    bucket: BUCKETS.issuePhotos,
    factoryId: args.factoryId,
    folder: 'exchanges',
    uri: args.photoUri,
    name: `exchange-${Date.now()}`,
  });
  const { data, error } = await supabase.rpc('record_exchange', {
    p_party_id: args.partyId,
    p_photo_url: photoUrl,
    p_lines: args.lines.map((line) => ({
      direction: line.direction,
      stock_item_id: line.stockItemId,
      qty: line.qty,
      unit_yards: line.unitYards,
      value: line.value,
    })),
  });
  if (error) throw error;
  return z.string().parse(data);
}

// --- Returns from the floor ---------------------------------------------------

const stockReturnSchema = z.object({
  id: uuid(),
  code: z.string(),
  qty: z.number(),
  returned_at: z.string(),
  stock_items: z.object({ code: z.string(), type: stockTypeSchema }),
  party: z.object({ name: z.string() }),
  orders: z.object({ code: z.string(), job_card_code: z.string().nullable() }).nullable(),
});
export type StockReturn = z.infer<typeof stockReturnSchema>;

export async function listStockReturns(factoryId: string): Promise<StockReturn[]> {
  const { data, error } = await supabase
    .from('stock_returns')
    .select('id, code, qty, returned_at, stock_items(code, type), party:party_id(name), orders(code, job_card_code)')
    .eq('factory_id', factoryId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return z.array(stockReturnSchema).parse(data);
}

/** One (order, code, party) that still has material out on the floor. */
export interface Returnable {
  orderId: string;
  orderLabel: string;
  stockItemId: string;
  code: string;
  type: StockType;
  partyId: string;
  party: string;
  /** Issued from this party's lots to this order, less what already came back. */
  outstanding: number;
}

const issuedDrawSchema = z.object({
  qty: z.number(),
  stock_lots: z.object({ party: z.object({ id: uuid(), name: z.string() }) }),
  issue_lines: z.object({
    order_id: uuid(),
    stock_item_id: uuid(),
    stock_items: z.object({ code: z.string(), type: stockTypeSchema }),
    orders: z.object({ code: z.string(), job_card_code: z.string().nullable() }).nullable(),
  }),
});

/**
 * What can come back, per order/code/party. The server enforces the same cap;
 * this is what lets the screen offer only real choices.
 */
export async function listReturnables(factoryId: string): Promise<Returnable[]> {
  const [draws, returns] = await Promise.all([
    supabase
      .from('stock_moves')
      .select(
        'qty, stock_lots(party:party_id(id, name)), ' +
          'issue_lines!inner(order_id, stock_item_id, stock_items(code, type), orders(code, job_card_code))',
      )
      .eq('factory_id', factoryId)
      .eq('kind', 'issue'),
    supabase
      .from('stock_returns')
      .select('order_id, stock_item_id, party_id, qty')
      .eq('factory_id', factoryId),
  ]);
  if (draws.error) throw draws.error;
  if (returns.error) throw returns.error;

  const rows = new Map<string, Returnable>();
  for (const draw of z.array(issuedDrawSchema).parse(draws.data)) {
    const line = draw.issue_lines;
    const party = draw.stock_lots.party;
    const key = `${line.order_id}|${line.stock_item_id}|${party.id}`;
    const row = rows.get(key) ?? {
      orderId: line.order_id,
      orderLabel: line.orders?.job_card_code ?? line.orders?.code ?? 'Order',
      stockItemId: line.stock_item_id,
      code: line.stock_items.code,
      type: line.stock_items.type,
      partyId: party.id,
      party: party.name,
      outstanding: 0,
    };
    row.outstanding += Math.abs(draw.qty);
    rows.set(key, row);
  }
  const returned = z
    .array(z.object({ order_id: uuid().nullable(), stock_item_id: uuid(), party_id: uuid(), qty: z.number() }))
    .parse(returns.data);
  for (const back of returned) {
    const row = rows.get(`${back.order_id}|${back.stock_item_id}|${back.party_id}`);
    if (row) row.outstanding -= back.qty;
  }
  return [...rows.values()].filter((row) => row.outstanding > 0);
}

export async function recordStockReturn(args: {
  orderId: string;
  stockItemId: string;
  partyId: string;
  qty: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_stock_return', {
    p_order_id: args.orderId,
    p_stock_item_id: args.stockItemId,
    p_party_id: args.partyId,
    p_qty: args.qty,
  });
  if (error) throw error;
  return z.string().parse(data);
}

// --- Issuance (Jobs) ----------------------------------------------------------

const issueLineSchema = z.object({
  id: uuid(),
  requested_grams: z.number().nullable(),
  required_qty: z.number().nullable(),
  issued_qty: z.number(),
  is_bobbin: z.boolean(),
  stock_items: z.object({ id: uuid(), code: z.string(), type: stockTypeSchema }),
  stock_moves: z.array(drawSchema),
});
export type IssueLine = z.infer<typeof issueLineSchema>;

const jobSchema = z.object({
  id: uuid(),
  code: z.string(),
  job_card_code: z.string().nullable(),
  floor_status: z.string().nullable(),
  materials: z.array(materialEntrySchema).nullable(),
  issued_date: z.string().nullable(),
  created_at: z.string(),
  clients: z.object({ name: z.string() }).nullable(),
  issued_profile: z.object({ full_name: z.string() }).nullable(),
  issue_lines: z.array(issueLineSchema),
});
export type Job = z.infer<typeof jobSchema>;

const JOB_SELECT =
  'id, code, job_card_code, floor_status, materials, issued_date, created_at, clients(name), ' +
  'issued_profile:issued_by(full_name), ' +
  'issue_lines(id, requested_grams, required_qty, issued_qty, is_bobbin, stock_items(id, code, type), ' +
  'stock_moves(qty, stock_lots(party:party_id(name))))';

export const jobLabel = (job: Pick<Job, 'job_card_code' | 'code'>) => job.job_card_code ?? job.code;

/**
 * A Job is an order at `floor_status = 'materialRequested'` — the same request
 * Floor Manager raised when the job card was approved. Issued jobs are the
 * orders this role has handed materials to, whatever state they reached since.
 */
export async function listJobs(factoryId: string): Promise<{ pending: Job[]; issued: Job[] }> {
  const [pending, issued] = await Promise.all([
    supabase
      .from('orders')
      .select(JOB_SELECT)
      .eq('factory_id', factoryId)
      .eq('floor_status', 'materialRequested')
      .order('created_at', { ascending: true }),
    supabase
      .from('orders')
      .select(JOB_SELECT)
      .eq('factory_id', factoryId)
      .not('issued_date', 'is', null)
      .order('issued_date', { ascending: false })
      .limit(30),
  ]);
  if (pending.error) throw pending.error;
  if (issued.error) throw issued.error;
  return {
    pending: z.array(jobSchema).parse(pending.data),
    issued: z.array(jobSchema).parse(issued.data),
  };
}

export async function getJob(orderId: string): Promise<Job> {
  const { data, error } = await supabase.from('orders').select(JOB_SELECT).eq('id', orderId).single();
  if (error) throw error;
  return jobSchema.parse(data);
}

/** One material line of a pending job, resolved to a stock code. */
export interface JobDraftLine {
  colorId: string;
  requestedGrams: number;
  /** Null when no thread code carries this colour — a gap to fix in stock. */
  code: StockCode | null;
}

/**
 * `orders.materials` names thread by SWATCHES colour; stock is keyed by code.
 * The bridge is `stock_items.color_id` on thread codes. Several codes of one
 * colour resolve to the lowest code; none is reported, not guessed.
 */
export function resolveJobLines(job: Job, book: StockBook): JobDraftLine[] {
  const threads = book.codes.filter((code) => code.type === 'thread');
  return (job.materials ?? []).map((entry) => ({
    colorId: entry.color_id,
    requestedGrams: entry.qty_grams,
    code: threads.find((code) => code.color_id === entry.color_id) ?? null,
  }));
}

export function bobbinsRequired(threadCones: number, ratio: number): number {
  return Math.ceil(threadCones * ratio);
}

export async function issueJob(args: {
  factoryId: string;
  orderId: string;
  photoUri: string;
  lines: { stockItemId: string; requestedGrams: number | null; issuedQty: number }[];
  bobbin: { stockItemId: string; issuedQty: number } | null;
}): Promise<void> {
  await uploadPhoto({
    bucket: BUCKETS.issuePhotos,
    factoryId: args.factoryId,
    folder: args.orderId,
    uri: args.photoUri,
    name: 'issue-proof',
  });

  const { error } = await supabase.rpc('issue_job', {
    p_order_id: args.orderId,
    p_lines: args.lines.map((line) => ({
      stock_item_id: line.stockItemId,
      requested_grams: line.requestedGrams,
      required_qty: null,
      issued_qty: line.issuedQty,
    })),
    p_bobbin: args.bobbin
      ? { stock_item_id: args.bobbin.stockItemId, issued_qty: args.bobbin.issuedQty }
      : null,
  });
  if (error) throw error;
}

// --- Audit --------------------------------------------------------------------

const auditSchema = z.object({
  id: uuid(),
  date: z.string(),
  items_checked: z.number(),
  variance_count: z.number(),
  audit_line_items: z.array(
    z.object({
      expected_qty: z.number(),
      actual_qty: z.number(),
      variance: z.number(),
      stock_items: z.object({ code: z.string(), type: stockTypeSchema }),
    }),
  ),
});
export type Audit = z.infer<typeof auditSchema>;

export async function listAudits(factoryId: string): Promise<Audit[]> {
  const { data, error } = await supabase
    .from('audit_records')
    .select(
      'id, date, items_checked, variance_count, ' +
        'audit_line_items(expected_qty, actual_qty, variance, stock_items(code, type))',
    )
    .eq('factory_id', factoryId)
    .order('date', { ascending: false });
  if (error) throw error;
  return z.array(auditSchema).parse(data);
}

/** Records the count. Never changes stock — a variance is a finding, not a fix. */
export async function submitAudit(lines: { stockItemId: string; counted: number }[]): Promise<void> {
  const { error } = await supabase.rpc('submit_audit', {
    p_lines: lines.map((line) => ({ stock_item_id: line.stockItemId, counted: line.counted })),
  });
  if (error) throw error;
}
