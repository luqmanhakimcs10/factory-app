import { create } from 'zustand';

import type { Profile } from '../data/types';

/**
 * The signed-in user's profile — factory and role.
 *
 * Every write path needs `factory_id` (storage paths are prefixed with it) and
 * navigation branches on `role`, so this is the one piece of state that is
 * genuinely global. Wizard drafts and in-progress inspections get their own
 * stores inside their feature modules.
 */
interface SessionState {
  profile: Profile | null;
  /** The factory's display name, shown in the home TopBar. */
  factoryName: string | null;
  /** True until the persisted Supabase session has been restored and resolved. */
  loading: boolean;
  /**
   * Why the session could not be established, when authentication itself
   * succeeded. Surfaced on the sign-in screen: an authenticated user with no
   * readable profile can see nothing under RLS, and failing silently there
   * looks identical to the button not working.
   */
  error: string | null;
  setProfile: (profile: Profile | null, factoryName?: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  profile: null,
  factoryName: null,
  loading: true,
  error: null,
  setProfile: (profile, factoryName = null) =>
    set({ profile, factoryName, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  clear: () => set({ profile: null, factoryName: null, loading: false, error: null }),
}));

/** Throws rather than returning null — call it only inside signed-in screens. */
export function requireFactoryId(): string {
  const factoryId = useSession.getState().profile?.factory_id;
  if (!factoryId) throw new Error('No signed-in profile: factory_id unavailable.');
  return factoryId;
}
