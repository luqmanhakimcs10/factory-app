import type { UserRole } from '../data/types';
import { AccountantStack } from './AccountantStack';
import { CompanyAdminStack } from './CompanyAdminStack';
import { FloorManagerStack } from './FloorManagerStack';
import { InspectionStack } from './InspectionStack';
import { StaffStack } from './StaffStack';
import { StoreManagerTabs } from './StoreManagerStack';

/**
 * Human-readable name for every role in the `user_role` enum.
 *
 * Kept complete rather than partial on purpose: the fallback screen names the
 * role a user actually has, and that role is by definition one with no module,
 * so a partial map would fall back to the raw enum string exactly where a real
 * person is reading it.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Company Admin',
  accountant: 'Accountant',
  floor_manager: 'Floor Manager',
  store_manager: 'Store Manager',
  order_taker: 'Order Taker',
  qa_person: 'QA Inspection',
  procurement: 'Procurement',
  delivery_person: 'Delivery Person',
  worker: 'Worker',
  finishing_partner: 'Finishing Partner',
  staff: 'Staff',
};

/**
 * The one place that decides which module a signed-in role gets.
 *
 * Both `RootNavigator` and the unavailable-role fallback read this map, so
 * shipping a module is a single edit here and the "currently covers ..." copy
 * cannot drift out of sync with what actually routes. Adding a key without
 * adding the stack, or a stack without the key, is a type error.
 *
 * `super_admin` is deliberately absent. The platform console sits above the
 * tenant boundary and is gated on `profiles.is_platform_admin` before this map
 * is consulted at all; a profile carrying that role without the flag falls
 * through to the fallback rather than into anybody's factory.
 *
 * Four roles share `StaffStack`, and that is the point of it. Order Taking and
 * Procurement stopped being modules of their own: they are grants now, and the
 * Staff Dashboard is the root that opens them. A dedicated `order_taker` or
 * `procurement` login still signs in and still reaches the same screens — it
 * lands on the Dashboard first, holding the single grant its role implies (see
 * `features/staff/grants.ts`), which is the same one card its module root used
 * to be. Nothing was taken away from those accounts; the way in moved.
 */
export const ROLE_STACKS: Partial<Record<UserRole, React.ComponentType>> = {
  qa_person: InspectionStack,
  floor_manager: FloorManagerStack,
  store_manager: StoreManagerTabs,
  accountant: AccountantStack,
  company_admin: CompanyAdminStack,
  delivery_person: StaffStack,
  staff: StaffStack,
  order_taker: StaffStack,
  procurement: StaffStack,
};

/** Roles that have a module, in the order they appear in `ROLE_STACKS`. */
export function builtRoles(): UserRole[] {
  return Object.keys(ROLE_STACKS) as UserRole[];
}

/**
 * "Order Taker, QA Inspection, Floor Manager, Store Manager and Accountant" —
 * derived from `ROLE_STACKS` so the fallback screen's copy is generated, never
 * written down a second time.
 */
export function builtRoleSentence(): string {
  const labels = builtRoles().map((role) => ROLE_LABELS[role]);
  if (labels.length === 0) return 'no modules yet';
  if (labels.length === 1) return labels[0] as string;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
