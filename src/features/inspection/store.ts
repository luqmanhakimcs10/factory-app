import { create } from 'zustand';

export interface LastAction {
  kind: 'passed' | 'returned';
  text: string;
}

interface InspectionSessionState {
  /**
   * The banner on the Inspect screen showing what the QA person just did.
   *
   * Deliberately session-local and not persisted: it reports the decision the
   * user made a moment ago, so it must not survive leaving the module and
   * coming back — the queue screen clears it on focus. Everything durable
   * about an inspection lives in Supabase.
   */
  lastAction: LastAction | null;
  setLastAction: (action: LastAction) => void;
  clearLastAction: () => void;
}

export const useInspectionSession = create<InspectionSessionState>((set) => ({
  lastAction: null,
  setLastAction: (lastAction) => set({ lastAction }),
  clearLastAction: () => set({ lastAction: null }),
}));

/** Labels for the six defect types, in the order the grid shows them. */
export const DEFECT_TYPES = [
  { id: 'thread', label: 'Thread Pull', icon: 'git-merge' },
  { id: 'hole', label: 'Hole-Tear', icon: 'scissors' },
  { id: 'stain', label: 'Stain', icon: 'droplet' },
  { id: 'wrongcolor', label: 'Wrong Color', icon: 'shuffle' },
  { id: 'misalign', label: 'Misalignment', icon: 'move' },
  { id: 'other', label: 'Other', icon: 'more-horizontal' },
] as const;

export function defectTypeLabel(id: string): string {
  return DEFECT_TYPES.find((entry) => entry.id === id)?.label ?? id;
}
