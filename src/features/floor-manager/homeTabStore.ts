import { create } from 'zustand';

import type { HomeTab } from './api';

/**
 * Which Home tab is showing.
 *
 * Held here rather than in a route param so that returning from a sub-flow does
 * not reset the queue to "All": every "back to queue" action sets the tab it
 * belongs to before navigating. Not per-route, and not persisted.
 */
interface HomeTabState {
  activeTab: HomeTab;
  setActiveTab: (tab: HomeTab) => void;
}

export const useHomeTab = create<HomeTabState>((set) => ({
  activeTab: 'all',
  setActiveTab: (activeTab) => set({ activeTab }),
}));
