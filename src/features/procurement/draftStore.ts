import { create } from 'zustand';

import type { StockType } from '../../data/types';
import type { AdditionalItemInput } from './api';

/**
 * The Fulfill screen's in-progress bill.
 *
 * Every price typed here stays local until Submit. That is the point rather
 * than an optimisation: a PO priced halfway and written per-tap would sit in
 * the database looking submitted-ish while being neither confirmable nor
 * findable, and `submit_procurement_bill` exists precisely so the whole bill
 * lands in one transaction or not at all.
 *
 * Keyed by PO id, so backing out of one PO and opening another cannot carry a
 * price across. `clear` is called from the Submitted screen's exit, which is
 * the only route out after a successful write.
 */

export interface AdditionalDraft extends AdditionalItemInput {
  /** Local-only id; the database row does not exist until submit. */
  key: string;
}

interface FulfillDraft {
  purchaseOrderId: string | null;
  /** Price per requested `po_items.id`. Absent means untouched, not zero. */
  prices: Record<string, number>;
  supplierId: string | null;
  photoUri: string | null;
  additional: AdditionalDraft[];
}

interface DraftState extends FulfillDraft {
  /** Start (or resume) the draft for one PO. A different id resets. */
  open: (purchaseOrderId: string) => void;
  setPrice: (itemId: string, price: number) => void;
  setSupplier: (supplierId: string) => void;
  setPhoto: (uri: string) => void;
  addAdditional: (item: AdditionalItemInput) => void;
  removeAdditional: (key: string) => void;
  clear: () => void;
}

const EMPTY: FulfillDraft = {
  purchaseOrderId: null,
  prices: {},
  supplierId: null,
  photoUri: null,
  additional: [],
};

let additionalSeq = 0;

export const useFulfillDraft = create<DraftState>((set) => ({
  ...EMPTY,

  open: (purchaseOrderId) =>
    set((state) =>
      // Re-opening the same PO keeps what was typed; the Queue is one tap away
      // and a mis-tap that wiped twelve prices would be unforgivable.
      state.purchaseOrderId === purchaseOrderId
        ? state
        : { ...EMPTY, purchaseOrderId },
    ),

  setPrice: (itemId, price) =>
    set((state) => ({ prices: { ...state.prices, [itemId]: price } })),

  setSupplier: (supplierId) => set({ supplierId }),
  setPhoto: (uri) => set({ photoUri: uri }),

  addAdditional: (item) =>
    set((state) => ({
      additional: [...state.additional, { ...item, key: `add-${(additionalSeq += 1)}` }],
    })),

  removeAdditional: (key) =>
    set((state) => ({ additional: state.additional.filter((item) => item.key !== key) })),

  clear: () => set({ ...EMPTY }),
}));

/** Which fields an add-item sub-draft must have before it can be added. */
export function canAddItem(args: {
  itemType: StockType | null;
  colorId: string | null;
  sequinSizeMm: number | null;
  sequinCutType: string | null;
  qty: number | null;
  price: number | null;
}): boolean {
  const { itemType, colorId, sequinSizeMm, sequinCutType, qty, price } = args;
  if (itemType === null) return false;
  if (qty === null || qty <= 0 || price === null || price <= 0) return false;

  switch (itemType) {
    case 'thread':
    case 'tilla':
      return colorId !== null;
    case 'sequin':
      return colorId !== null && sequinSizeMm !== null && sequinCutType !== null;
    case 'bobbin':
      // No colour, no size, no cut — quantity and price are the whole of it.
      return true;
  }
}
