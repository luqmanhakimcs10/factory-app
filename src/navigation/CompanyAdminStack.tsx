import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CompanyAdminComingSoonScreen } from '../features/company-admin/ComingSoonScreen';
import { ApprovalDetailScreen } from '../features/company-admin/approvals/ApprovalDetailScreen';
import { ApprovalsScreen } from '../features/company-admin/approvals/ApprovalsScreen';
import { BonusSlabsScreen } from '../features/company-admin/bonus/BonusSlabsScreen';
import { SlabFormScreen } from '../features/company-admin/bonus/SlabFormScreen';
import { ClientFormScreen } from '../features/company-admin/clients/ClientFormScreen';
import { ClientsScreen } from '../features/company-admin/clients/ClientsScreen';
import { CompanyAdminDashboardScreen } from '../features/company-admin/dashboard/DashboardScreen';
import { EmployeeFormScreen } from '../features/company-admin/employees/EmployeeFormScreen';
import { EmployeesScreen } from '../features/company-admin/employees/EmployeesScreen';
import { FinishingPartnerFormScreen } from '../features/company-admin/partners/FinishingPartnerFormScreen';
import { FinishingPartnersScreen } from '../features/company-admin/partners/FinishingPartnersScreen';
import { ReportsScreen } from '../features/company-admin/reports/ReportsScreen';
import { SupplierFormScreen } from '../features/company-admin/suppliers/SupplierFormScreen';
import { SuppliersScreen } from '../features/company-admin/suppliers/SuppliersScreen';
import type {
  AdminClient,
  Employee,
  FinishingPartner,
  Supplier,
} from '../features/company-admin/rosters';
import type { ApprovableType } from '../lib/approvalMutations';

/**
 * Company Admin.
 *
 * `0010_company_admin.sql` shipped the whole database side of this role —
 * three-state `approval_status`, the four master-data rosters, and four
 * security-definer approval RPCs — and the app module is now built against all
 * of it: the approvals inbox, the five-tab Reports Hub, and the five rosters
 * this role owns.
 *
 * Every form route takes the row it edits as a param rather than an id it then
 * re-fetches. The list screen has just read that row, the form is only ever
 * reached from the list, and `useQuery` refetches on focus — so going back
 * after a save shows the saved values without either screen coordinating a
 * cache. An empty object is the "add" case, which is why the params are
 * optional rather than the route being duplicated per mode.
 *
 * `ComingSoon` survives for exactly one destination: the dashboard's
 * notification bell, which has no table behind it.
 */
export type CompanyAdminStackParamList = {
  Dashboard: undefined;
  Approvals: undefined;
  ApprovalDetail: { kind: ApprovableType; id: string };
  Reports: undefined;
  BonusSlabs: undefined;
  SlabForm: { id?: string; threshold?: number; bonusAmount?: number };
  Employees: undefined;
  EmployeeForm: { employee?: Employee };
  FinishingPartners: undefined;
  FinishingPartnerForm: { partner?: FinishingPartner };
  Suppliers: undefined;
  SupplierForm: { supplier?: Supplier };
  Clients: undefined;
  ClientForm: { client?: AdminClient };
  ComingSoon: { title: string; note?: string };
};

const Stack = createNativeStackNavigator<CompanyAdminStackParamList>();

export function CompanyAdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={CompanyAdminDashboardScreen} />
      <Stack.Screen name="Approvals" component={ApprovalsScreen} />
      <Stack.Screen name="ApprovalDetail" component={ApprovalDetailScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="BonusSlabs" component={BonusSlabsScreen} />
      {/*
        A slab is edited over its own list, and the numeric keypad it opens is
        itself a modal — presenting the form as a modal route keeps that keypad
        from having to stack on top of another `Modal`, which React Native does
        not reliably support on either platform.
      */}
      <Stack.Screen
        name="SlabForm"
        component={SlabFormScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="Employees" component={EmployeesScreen} />
      <Stack.Screen name="EmployeeForm" component={EmployeeFormScreen} />
      <Stack.Screen name="FinishingPartners" component={FinishingPartnersScreen} />
      <Stack.Screen name="FinishingPartnerForm" component={FinishingPartnerFormScreen} />
      <Stack.Screen name="Suppliers" component={SuppliersScreen} />
      <Stack.Screen name="SupplierForm" component={SupplierFormScreen} />
      <Stack.Screen name="Clients" component={ClientsScreen} />
      <Stack.Screen name="ClientForm" component={ClientFormScreen} />
      <Stack.Screen name="ComingSoon" component={CompanyAdminComingSoonScreen} />
    </Stack.Navigator>
  );
}
