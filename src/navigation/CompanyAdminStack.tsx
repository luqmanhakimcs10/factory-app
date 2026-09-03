import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CompanyAdminComingSoonScreen } from '../features/company-admin/ComingSoonScreen';
import { ApprovalDetailScreen } from '../features/company-admin/approvals/ApprovalDetailScreen';
import { ApprovalsScreen } from '../features/company-admin/approvals/ApprovalsScreen';
import { CompanyAdminDashboardScreen } from '../features/company-admin/dashboard/DashboardScreen';
import type { ApprovableType } from '../lib/approvalMutations';

/**
 * Company Admin.
 *
 * `0010_company_admin.sql` shipped the whole database side of this role —
 * three-state `approval_status`, the four master-data rosters, and four
 * security-definer approval RPCs — and then no app module was built against it,
 * which is why a company admin signed in and landed on the unavailable-role
 * screen for as long as they did.
 *
 * What is here is the half of that schema that has a decision attached to it:
 * the approvals inbox, and the dashboard that counts what is waiting in it.
 * Approving an expense or a loan is this role's only write anywhere in the app
 * — every other table it owns is a roster it edits, and those forms are not
 * specced yet, so they land on `ComingSoon` rather than on an invented shape.
 */
export type CompanyAdminStackParamList = {
  Dashboard: undefined;
  Approvals: undefined;
  ApprovalDetail: { kind: ApprovableType; id: string };
  ComingSoon: { title: string; note?: string };
};

const Stack = createNativeStackNavigator<CompanyAdminStackParamList>();

export function CompanyAdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={CompanyAdminDashboardScreen} />
      <Stack.Screen name="Approvals" component={ApprovalsScreen} />
      <Stack.Screen name="ApprovalDetail" component={ApprovalDetailScreen} />
      <Stack.Screen name="ComingSoon" component={CompanyAdminComingSoonScreen} />
    </Stack.Navigator>
  );
}
