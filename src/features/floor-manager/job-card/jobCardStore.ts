import { create } from 'zustand';

import type { NeedleEntry, OrderStages, ThreadEntry } from '../../../data/types';

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

  /** Wipes the draft and seeds it for a specific order. */
  begin: (orderId: string) => void;
  clear: () => void;
  setDesignSheetPhotoUri: (uri: string | null) => void;
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
};

export const useJobCard = create<JobCardState>((set) => ({
  ...initialState,

  begin: (orderId) => set({ ...initialState, needles: [], orderId }),

  clear: () => set({ ...initialState, needles: [] }),

  setDesignSheetPhotoUri: (designSheetPhotoUri) => set({ designSheetPhotoUri }),

  setDesignCode: (designCode) => set({ designCode }),

  setJobCardCode: (jobCardCode) => set({ jobCardCode }),

  seedNeedles: (threads) =>
    set((state) => {
      if (state.needles.length > 0) return state;
      return {
        needles: threads.map((thread, index) => ({
          color_id: thread.color_id,
          // Needles default to 1, 2, 3… — the usual physical layout, and the
          // floor manager corrects it where the machine is threaded otherwise.
          needle: index + 1,
          stitches: thread.stitches,
        })),
      };
    }),

  setNeedle: (colorId, patch) =>
    set((state) => ({
      needles: state.needles.map((entry) =>
        entry.color_id === colorId ? { ...entry, ...patch } : entry,
      ),
    })),

  setStages: (stages) => set({ stages }),
}));
