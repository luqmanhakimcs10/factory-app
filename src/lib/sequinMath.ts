/**
 * Sequin piece counts.
 *
 * Sequin is bought and counted in "CDs" — a CD is a 90-yard reel — but stock is
 * consumed and audited in individual pieces. This is the conversion, and it is
 * the one 0008 refused to guess: `stock_items.piece_count` was left null with a
 * "do not invent a formula" note until the real factor arrived.
 *
 * The wastage factor is not slack in the maths. Sequins come strung on a thread
 * and the run is trimmed at both ends of every application, so the usable count
 * off a reel is reliably below the geometric one.
 *
 * This file is the single owner of that arithmetic. Store Manager's Stock tab
 * and Procurement's Fulfill screen both describe the same physical stock, and
 * two implementations of one formula is how they end up disagreeing about how
 * many pieces are in the room.
 */

/** Yards on one CD reel. */
const CD_YARDS = 90;

/** Millimetres per yard. */
const MM_PER_YARD = 914;

/** Usable fraction of a reel after trimming. */
const SEQUIN_WASTAGE_FACTOR = 0.8;

/** Pieces on a single CD, for a given sequin diameter in millimetres. */
export function sequinsPerCd(sizeMm: number): number {
  return Math.round(((MM_PER_YARD * CD_YARDS) / sizeMm) * SEQUIN_WASTAGE_FACTOR);
}

/** Pieces represented by a quantity of CDs at a given size. */
export function piecesFor(qtyInCds: number, sizeMm: number): number {
  return Math.round(qtyInCds * sequinsPerCd(sizeMm));
}
