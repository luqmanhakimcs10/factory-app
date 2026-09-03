/**
 * The finishing stages that can follow embroidery.
 *
 * Order matters: the queue for an order is this object's keys filtered to the
 * ones its `stages` flags enable, always in this sequence.
 */
export const STAGE_DEFS = {
  clipping: { label: 'Clipping', workerLabel: 'Clipper' },
  piko: { label: 'Piko', workerLabel: 'Piko Worker' },
  press: { label: 'Press', workerLabel: 'Press Worker' },
} as const;

export type StageKey = keyof typeof STAGE_DEFS;

/** Fixed evaluation order for the per-sheet stage queue. */
export const STAGE_ORDER: readonly StageKey[] = ['clipping', 'piko', 'press'];
