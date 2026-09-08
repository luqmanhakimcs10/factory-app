import { useCallback } from 'react';
import { z } from 'zod';

import { supabase } from '../../data/supabase';
import { uuid, type UserRole } from '../../data/types';
import { useQuery } from '../../data/useQuery';
import { useSession } from '../../state/session';
import { RESPONSIBILITIES, type Responsibility } from '../company-admin/rosters';

/**
 * What the signed-in person is allowed to do, and who they are while doing it.
 *
 * The grant is the unit of permission for this persona — not the role. One
 * login can hold any subset of the five responsibilities, so the Dashboard
 * renders one card per grant held and nothing else, and every RPC re-checks the
 * same grant server-side via `has_grant()`. Neither check substitutes for the
 * other: this one shapes the screen, that one is the boundary.
 */

const grantRowSchema = z.object({
  id: uuid(),
  name: z.string(),
  responsibilities: z.array(z.enum(RESPONSIBILITIES)).nullable(),
});

export interface StaffGrants {
  /** Held grants, in `RESPONSIBILITIES` order rather than array order. */
  grants: Responsibility[];
  /**
   * The employee's own name, for the personalized header.
   *
   * Falls back to `profiles.full_name` when the account has no linked roster
   * row — the header still has to name somebody.
   */
  displayName: string;
  /** True when the roster row exists and is linked to this login. */
  linked: boolean;
}

/**
 * Grants a legacy dedicated-role login carries without an `employees` row.
 *
 * `0013_staff_persona.sql` extended every policy to `role = 'order_taker' OR
 * has_grant('orderTaking')` precisely so those accounts keep working, and the
 * UI has to agree with the policies or a taker signs in to an empty dashboard
 * while the database is still perfectly willing to serve them. Implied, not
 * stored: nothing writes these, and an employee row always wins.
 */
const IMPLIED_BY_ROLE: Partial<Record<UserRole, Responsibility[]>> = {
  order_taker: ['orderTaking'],
  procurement: ['procurePo'],
};

/** Sorts held grants into the canonical chip/card order. */
function inCanonicalOrder(held: readonly Responsibility[]): Responsibility[] {
  return RESPONSIBILITIES.filter((grant) => held.includes(grant));
}

export async function loadGrants(
  profileId: string,
  role: UserRole,
  fullName: string,
): Promise<StaffGrants> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, name, responsibilities')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;

  const row = data ? grantRowSchema.parse(data) : null;
  const implied = IMPLIED_BY_ROLE[role] ?? [];

  // The roster row is the record when there is one, even if its
  // `responsibilities` array is empty — an admin who cleared every grant meant
  // to, and silently restoring one from the role would undo that.
  const held = row ? (row.responsibilities ?? []) : implied;

  return {
    grants: inCanonicalOrder(held),
    displayName: row?.name ?? fullName,
    linked: row !== null,
  };
}

/** Fetch-on-focus wrapper, so a grant revoked mid-shift takes effect on return. */
export function useGrants() {
  const profile = useSession((state) => state.profile);
  const profileId = profile?.id;
  const role = profile?.role;
  const fullName = profile?.full_name;

  const fetcher = useCallback(
    () => loadGrants(profileId as string, role as UserRole, fullName ?? ''),
    [profileId, role, fullName],
  );

  return useQuery(fetcher, Boolean(profileId && role));
}

/**
 * Whether to warn that one person both requests material and buys it.
 *
 * Generalized from the mockup's single hardcoded sentence into the rule behind
 * it: the note is about a separation-of-duties overlap, so it shows whenever
 * the buying grant sits alongside a grant that moves material. `sheetMovement`
 * is the only other material-touching grant today; adding one to this list is
 * how a future grant joins the rule rather than needing a second note.
 */
const MATERIAL_HANDLING: readonly Responsibility[] = ['sheetMovement'];

export function hasDutyOverlap(grants: readonly Responsibility[]): boolean {
  return (
    grants.includes('procurePo') &&
    MATERIAL_HANDLING.some((grant) => grants.includes(grant))
  );
}

export type { Responsibility };
