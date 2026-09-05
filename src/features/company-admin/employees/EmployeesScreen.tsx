import { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { RosterScreen } from '../RosterScreen';
import type { RosterEntry } from '../components';
import {
  EMPLOYEE_ROLE_LABELS,
  SALARY_BASIS_LABELS,
  listEmployees,
  monthYear,
  salaryLabel,
  type Employee,
} from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'Employees'>;

/**
 * "0301-2345671 · Joined Jan 2024 · Fixed · Rs. 18,000/mo".
 *
 * The contact number leads because it is what someone opening this screen is
 * usually after. CNIC stands in when there is no number — an employee row with
 * neither is possible, since only the name, role and rate are required.
 */
function subLabel(employee: Employee): string {
  return [
    employee.contact ?? employee.cnic ?? 'No contact',
    `Joined ${monthYear(employee.join_date)}`,
    SALARY_BASIS_LABELS[employee.salary_basis],
    salaryLabel(employee.salary_basis, employee.salary_amount),
  ].join(' · ');
}

function toEntry(employee: Employee): RosterEntry {
  return {
    id: employee.id,
    name: employee.name,
    pill: EMPLOYEE_ROLE_LABELS[employee.role],
    subLabel: subLabel(employee),
    active: employee.status === 'active',
  };
}

export function EmployeesScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(() => listEmployees(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const employees = data ?? [];

  return (
    <RosterScreen
      title="Employees"
      addLabel="Add Employee"
      entries={employees.map(toEntry)}
      loading={loading}
      error={error}
      emptyHint="This roster is the factory's own HR record — it is separate from who can sign in to the app."
      onBack={navigation.goBack}
      onAdd={() => navigation.navigate('EmployeeForm', {})}
      onOpen={(id) => {
        const employee = employees.find((entry) => entry.id === id);
        if (employee) navigation.navigate('EmployeeForm', { employee });
      }}
    />
  );
}
