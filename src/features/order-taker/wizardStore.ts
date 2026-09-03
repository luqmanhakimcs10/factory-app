import { create } from 'zustand';

/** One sheet in the order: a colour and how many repeats of it. */
export interface SheetDraft {
  colorId: string;
  customHex: string | null;
  repeats: number;
}

export interface NewClientDraft {
  photoUri: string | null;
  phone: string;
}

interface WizardState {
  selectedClientId: string | null;
  /** Non-null only while the new-client path is being used. */
  newClientDraft: NewClientDraft | null;
  sheetCount: number;
  /**
   * One proof photo for the whole order, covering every sheet — not one per
   * colour. Order-level on purpose: the intake photo is of the stack.
   */
  orderPhotoUri: string | null;
  sheets: SheetDraft[];
  currentSheetIndex: number;
  designSheetPhotoUri: string | null;
  /** Set when resuming an abandoned draft, so submit updates rather than inserts. */
  resumingOrderId: string | null;

  reset: () => void;
  setSelectedClientId: (id: string | null) => void;
  setNewClientDraft: (draft: NewClientDraft | null) => void;
  setSheetCount: (count: number) => void;
  setOrderPhotoUri: (uri: string | null) => void;
  /** Size `sheets` to `sheetCount`, keeping anything already filled in. */
  initSheets: () => void;
  setSheet: (index: number, sheet: SheetDraft) => void;
  setCurrentSheetIndex: (index: number) => void;
  setDesignSheetPhotoUri: (uri: string | null) => void;
  /** Rehydrate from a draft order fetched out of Supabase. */
  hydrateFromDraft: (draft: {
    orderId: string;
    clientId: string;
    orderPhotoUri: string | null;
    designSheetPhotoUri: string | null;
    sheets: SheetDraft[];
  }) => void;
}

const EMPTY_SHEET: SheetDraft = { colorId: '', customHex: null, repeats: 1 };

const initialState = {
  selectedClientId: null,
  newClientDraft: null,
  sheetCount: 1,
  orderPhotoUri: null,
  sheets: [] as SheetDraft[],
  currentSheetIndex: 0,
  designSheetPhotoUri: null,
  resumingOrderId: null,
};

/**
 * Wizard draft state.
 *
 * Photos stay as local URIs the whole way through and are uploaded in one
 * batch at submit. Uploading on each tap would leave orphaned files in storage
 * behind every abandoned wizard, and abandoning a wizard is common — the
 * client changes their mind halfway through the count.
 *
 * Reset happens on: the new-order FAB, "Back to My Orders" from Submitted, and
 * a successful submit. Never on in-wizard back navigation.
 */
export const useWizard = create<WizardState>((set) => ({
  ...initialState,

  reset: () => set({ ...initialState, sheets: [] }),

  setSelectedClientId: (selectedClientId) =>
    set({ selectedClientId, newClientDraft: null }),

  setNewClientDraft: (newClientDraft) => set({ newClientDraft }),

  setSheetCount: (sheetCount) => set({ sheetCount }),

  setOrderPhotoUri: (orderPhotoUri) => set({ orderPhotoUri }),

  initSheets: () =>
    set((state) => ({
      sheets: Array.from(
        { length: state.sheetCount },
        (_, index) => state.sheets[index] ?? { ...EMPTY_SHEET },
      ),
      currentSheetIndex: 0,
    })),

  setSheet: (index, sheet) =>
    set((state) => {
      const sheets = [...state.sheets];
      sheets[index] = sheet;
      return { sheets };
    }),

  setCurrentSheetIndex: (currentSheetIndex) => set({ currentSheetIndex }),

  setDesignSheetPhotoUri: (designSheetPhotoUri) => set({ designSheetPhotoUri }),

  hydrateFromDraft: (draft) =>
    set({
      ...initialState,
      resumingOrderId: draft.orderId,
      selectedClientId: draft.clientId,
      orderPhotoUri: draft.orderPhotoUri,
      designSheetPhotoUri: draft.designSheetPhotoUri,
      sheets: draft.sheets,
      sheetCount: Math.max(1, draft.sheets.length),
    }),
}));

/** A sheet is complete once a colour is picked; repeats always has a value. */
export function isSheetComplete(sheet: SheetDraft | undefined): boolean {
  return Boolean(sheet && sheet.colorId && sheet.repeats > 0);
}
