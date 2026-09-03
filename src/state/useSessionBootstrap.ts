import { useEffect } from 'react';
import { z } from 'zod';

import { supabase } from '../data/supabase';
import { userRoleSchema, uuid } from '../data/types';
import { useSession } from './session';

const profileRowSchema = z.object({
  id: uuid(),
  factory_id: uuid(),
  role: userRoleSchema,
  full_name: z.string(),
  is_platform_admin: z.boolean(),
  created_at: z.string(),
  factories: z.object({ name: z.string() }).nullable(),
});

async function loadProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, factory_id, role, full_name, is_platform_admin, created_at, factories(name)')
    .eq('id', userId)
    .single();

  if (error) throw error;
  const row = profileRowSchema.parse(data);
  const { factories, ...profile } = row;
  return { profile, factoryName: factories?.name ?? null };
}

/**
 * Restores the persisted Supabase session on launch and keeps the session
 * store in step with sign-in / sign-out afterwards.
 *
 * Call once, at the app root.
 */
export function useSessionBootstrap() {
  const setProfile = useSession((state) => state.setProfile);
  const setError = useSession((state) => state.setError);
  const clear = useSession((state) => state.clear);

  useEffect(() => {
    let cancelled = false;

    const apply = async (userId: string | undefined) => {
      if (!userId) {
        if (!cancelled) clear();
        return;
      }
      try {
        const { profile, factoryName } = await loadProfile(userId);
        if (!cancelled) setProfile(profile, factoryName);
      } catch (caught) {
        // An authenticated user with no readable profile can see nothing under
        // RLS, so this is a dead end — but it has to say so rather than drop
        // the user back on the sign-in screen with no explanation.
        if (cancelled) return;
        const detail = caught instanceof Error ? caught.message : String(caught);
        setError(
          `Signed in, but no profile row could be read for this account. ${detail}`,
        );
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.user.id))
      .catch(() => {
        if (!cancelled) clear();
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      // Deferred out of the callback deliberately. supabase-js holds an
      // internal auth lock while these listeners run, and awaiting another
      // supabase call from inside one deadlocks: sign-in resolves, the listener
      // fires, and the profile query then waits forever on a lock the listener
      // itself is holding. The symptom is a sign-in that succeeds and a screen
      // that never changes.
      const userId = session?.user.id;
      setTimeout(() => void apply(userId), 0);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [setProfile, setError, clear]);
}
