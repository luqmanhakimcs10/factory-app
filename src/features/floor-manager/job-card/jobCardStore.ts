import { create } from 'zustand';

import type { NeedleEntry, OrderStages, ThreadEntry } from '../../../data/types';
import { applyToNeedles, type DesignSheetExtraction } from '../designSheet';

/**
 * Job-card draft, scoped to that sub-flow only.
 *
 * Cleared on entry to the flow and on exit back to Home, so one order's needle
 * layout can never leak into the next order's job card. Kept separate from the
 * inventory and stage-form drafts on purpose — one giant form object is how
 * that leak happens.
 */
interface JobCardState {
  orderId: string | null;
  designSheetPhotoUri: string | null;
  designCode: string | null;
  jobCardCode: string | null;
  needles: NeedleEntry[];
  stages: OrderStages;

  /** The structured read of the photographed sheet, once one has been done. */
  extraction: DesignSheetExtraction | null;
  /**
   * Colour ids whose stitch count came off the sheet and has not been confirmed
   * against the paper yet.
   *
   * A set of ids rather than a flag per row, because "unconfirmed" is a property
   * of where a number came from, not of the row: a count the floor manager typed
   * was never unconfirmed, and one they corrected stops being so the moment they
   * touch it. Empty whenever nothing was extracted, which is why a job card built
   * without the camera behaves exactly as it always did.
   */
  unconfirmedColorIds: string[];

  /** Wipes the draft and seeds it for a specific order. */
  begin: (orderId: string) => void;
  clear: () => void;
  setDesignSheetPhotoUri: (uri: string | null) => void;
  /**
   * Record a fresh read of the sheet, folding it into the needle rows.
   *
   * Safe to call before the rows exist — `seedNeedles` re-applies whatever is
   * held here once they do, which is the normal order since the sheet is
   * photographed a screen earlier than the needles are seeded.
   *
   * `null` discards a previous read, which is what a re-photograph does: the
   * colours on screen would otherwise belong to a sheet that is no longer the
   * one in the picture. The needle rows keep whatever values they had, because
   * the floor manager may already have confirmed or corrected some of them and
   * a new photo is not a reason to throw that away.
   */
  setExtraction: (extraction: DesignSheetExtraction | null) => void;
  /** Accept one proposed row as read. */
  confirmColor: (colorId: string) => void;
  /** Accept every proposed row at once. */
  confirmAll: () => void;
  setDesignCode: (code: string) => void;
  setJobCardCode: (code: string) => void;
  /** Seed needle rows from the order's QA-owned thread list, once. */
  seedNeedles: (threads: ThreadEntry[]) => void;
  setNeedle: (colorId: string, patch: Partial<Omit<NeedleEntry, 'color_id'>>) => void;
  setStages: (stages: OrderStages) => void;
}

const EMPTY_STAGES: OrderStages = { clipping: false, piko: false, press: false };

const initialState = {
  orderId: null,
  designSheetPhotoUri: null,
  designCode: null,
  jobCardCode: null,
  needles: [] as NeedleEntry[],
  stages: EMPTY_STAGES,
  extraction: null as DesignSheetExtraction | null,
  unconfirmedColorIds: [] as string[],
};

export const useJobCard = create<JobCardState>((set) => ({
  ...initialState,

  begin: (orderId) => set({ ...initialState, needles: [], orderId }),

  clear: () => set({ ...initialState, needles: [] }),

  setDesignSheetPhotoUri: (designSheetPhotoUri) => set({ designSheetPhotoUri }),

  setExtraction: (extraction) =>
    set((state) => ({ extraction, ...fold(state.needles, extraction) })),

  confirmColor: (colorId) =>
    set((state) => ({
      unconfirmedColorIds: state.unconfirmedColorIds.filter((id) => id !== colorId),
    })),

  confirmAll: () => set({ unconfirmedColorIds: [] }),

  setDesignCode: (designCode) => set({ designCode }),

  setJobCardCode: (jobCardCode) => set({ jobCardCode }),

  seedNeedles: (threads) =>
    set((state) => {
      if (state.needles.length > 0) return state;
      const seeded = threads.map((thread, index) => ({
        color_id: thread.color_id,
        // Needles default to 1, 2, 3… — the usual physical layout, and the
        // floor manager corrects it where the machine is threaded otherwise.
        needle: index + 1,
        stitches: thread.stitches,
      }));
      // The sheet is read on step 1 and the rows are not seeded until step 2, so
      // an extraction taken before this point has nothing to fold into yet. It
      // is re-applied here rather than in a screen effect: the ordering belongs
      // to whoever owns both pieces of state, and a `useEffect` racing a seed is
      // how a prefill silently lands on an empty array.
      return { needles: seeded, ...fold(seeded, state.extraction) };
    }),

  setNeedle: (colorId, patch) =>
    set((state) => ({
      needles: state.needles.map((entry) =>
        entry.color_id === colorId ? { ...entry, ...patch } : entry,
      ),
      // Editing a row is confirming it. The floor manager just looked at the
      // paper and typed what it says, which is the whole point of the confirm
      // step — leaving it flagged afterwards would ask them to agree with
      // themselves.
      unconfirmedColorIds: state.unconfirmedColorIds.filter((id) => id !== colorId),
    })),

  setStages: (stages) => set({ stages }),
}));

/** Needle rows and confirm flags for an extraction, or nothing to change. */
function fold(
  needles: NeedleEntry[],
  extraction: DesignSheetExtraction | null,
): Pick<JobCardState, 'needles' | 'unconfirmedColorIds'> | Record<string, never> {
  if (!extraction || needles.length === 0) return {};
  const proposal = applyToNeedles(needles, extraction);
  return { needles: proposal.needles, unconfirmedColorIds: proposal.proposedColorIds };
}
