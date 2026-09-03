/**
 * TEMPORARY. Hard-coded staff list for this pass.
 *
 * There is no `staff` table yet, and `profiles` only carries app users — the
 * clippers, piko and press workers on the floor do not sign in. Replace with a
 * real query once that table exists; every use site reads from here so the swap
 * is one file.
 */
export const WORKERS = [
  'Imran Ali',
  'Faisal Khan',
  'Rashid Mehmood',
  'Usman Tariq',
  'Shahid Iqbal',
] as const;

export type WorkerName = (typeof WORKERS)[number];
