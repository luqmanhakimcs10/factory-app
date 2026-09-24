import type { StockType } from '../data/types';
import { piecesFor } from './sequinMath';

/**
 * How a quantity of stock reads, per material type.
 *
 * One owner for all four shapes, because the same physical quantity is shown on
 * Store Manager's Stock tab, on Procurement's Fulfill screen and on the PO
 * Detail confirm screen. Formatting it per screen is how "14 CDs" on one screen
 * becomes "14" on another, and how two screens end up disagreeing about how
 * many sequin pieces that is.
 *
 * The unit each type is *counted* in is part of the contract, not a display
 * choice: thread is cones, tilla is grams, sequin is CDs, bobbin is pieces.
 * That is what `QUANTITY_UNITS` names, and it is also what the numeric keypad
 * shows as its suffix while the number is being typed.
 *
 * Thread moved from grams to cones with the lot-based stock model (0018): a
 * lot is bought and drained by the cone, and each lot carries its own yards per
 * cone. Floor Manager's material requests are still computed in grams and have
 * no cone conversion; they are shown as grams where they appear.
 */

export const QUANTITY_UNITS: Record<StockType, string> = {
  thread: 'cones',
  tilla: 'g',
  sequin: 'CDs',
  bobbin: 'pcs',
};

/** "1.2 kg" above a kilo, "840 g" below it. */
export function formatGrams(grams: number): string {
  return grams >= 1000
    ? `${(grams / 1000).toFixed(1)} kg`
    : `${grams.toLocaleString()} g`;
}

/**
 * "3 CDs (~21,936 pcs)" — the reel count with its piece count in brackets.
 *
 * The piece count is always derived, never stored or typed, so it renders as a
 * parenthetical on the reel count rather than as a figure of its own.
 */
export function formatSequin(qtyInCds: number, sizeMm: number | null): string {
  const reels = `${qtyInCds.toLocaleString()} ${qtyInCds === 1 ? 'CD' : 'CDs'}`;
  if (sizeMm === null || sizeMm <= 0) return reels;
  return `${reels} (~${piecesFor(qtyInCds, sizeMm).toLocaleString()} pcs)`;
}

/** The one entry point: a quantity, formatted for whatever type it is. */
export function formatQuantity(
  stockType: StockType,
  qty: number,
  sizeMm: number | null = null,
): string {
  switch (stockType) {
    case 'thread':
      return `${qty.toLocaleString()} ${qty === 1 ? 'cone' : 'cones'}`;
    case 'tilla':
      return formatGrams(qty);
    case 'sequin':
      return formatSequin(qty, sizeMm);
    case 'bobbin':
      return `${qty.toLocaleString()} pcs`;
  }
}
