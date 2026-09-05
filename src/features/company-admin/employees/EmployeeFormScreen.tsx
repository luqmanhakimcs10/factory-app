import { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, NumericKeypadSheet } from '../../../components';
import { confirmDestructive } from '../../../lib/alert';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { FormScreen } from '../FormScreen';
import { ChipField, PhotoField, PriceField, StaticTextField, TextField } from '../components';
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  SALARY_AMOUNT_LABELS,
  SALARY_BASES,
  SALARY_BASIS_LABELS,
  allowsSalaryBasisChoice,
  monthYear,
  salaryFieldValue,
  saveEmployee,
  type EmployeeRole,
  type RosterStatus,
  type SalaryBasis,
} from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'EmployeeForm'>;

const ROLE_OPTIONS = EMPLOYEE_ROLES.map((role) => ({
  value: role,
  label: EMPLOYEE_ROLE_LABELS[role],
}));

const BASIS_OPTIONS = SALARY_BASES.map((basis) => ({
  value: basis,
  label: SALARY_BASIS_LABELS[basis],
}));

/** Trimmed, or null — an empty optional field is absent, not an empty string. */
function optional(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

/**
 * Add or edit one employee.
 *
 * Field order is the mockup's and is load-bearing rather than incidental: the
 * identity documents come before the terms of employment, because that is the
 * order the paperwork arrives in on the floor.
 *
 * Two rules are enforced here as well as in the database:
 *
 * - **Salary basis follows the role.** Only a machine worker is paid by output,
 *   so only a machine worker gets the three-way picker; every other role — and
 *   the state before any role is picked — renders a flat, non-interactive
 *   "Fixed". That mirrors the `salary_basis_matches_role` check constraint, and
 *   switching away from Machine Worker resets the basis rather than leaving an
 *   illegal value the save would then be rejected for.
 * - **Save needs a name, a role and a rate.** Everything else, photographs
 *   included, is genuinely optional.
 */
export function EmployeeFormScreen({ navigation, route }: Props) {
  const existing = route.params.employee;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [name, setName] = useState(existing?.name ?? '');
  const [employeePhoto, setEmployeePhoto] = useState<string | null>(
    existing?.employee_photo_url ?? null,
  );
  const [cnic, setCnic] = useState(existing?.cnic ?? '');
  const [cnicPhoto, setCnicPhoto] = useState<string | null>(existing?.cnic_photo_url ?? null);
  const [address, setAddress] = useState(existing?.address ?? '');
  const [reference, setReference] = useState(existing?.reference_name ?? '');
  const [role, setRole] = useState<EmployeeRole | null>(existing?.role ?? null);
  const [basis, setBasis] = useState<SalaryBasis>(existing?.salary_basis ?? 'fixed');
  const [salary, setSalary] = useState<number | null>(existing?.salary_amount ?? null);
  const [contact, setContact] = useState(existing?.contact ?? '');

  const [keypadOpen, setKeypadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choosesBasis = allowsSalaryBasisChoice(role);
  const canSave = name.trim().length > 0 && role !== null && salary !== null && salary > 0;

  const pickRole = (next: EmployeeRole) => {
    setRole(next);
    // Leaving Machine Worker leaves `basis` on a value the check constraint
    // rejects, and the picker that could correct it is gone by then.
    if (!allowsSalaryBasisChoice(next)) setBasis('fixed');
  };

  const submit = async (status: RosterStatus) => {
    if (!canSave || !factoryId || !role || salary === null) return;

    setSaving(true);
    setError(null);
    try {
      await saveEmployee({
        factoryId,
        id: existing?.id,
        input: {
          name: name.trim(),
          role,
          salaryBasis: choosesBasis ? basis : 'fixed',
          salaryAmount: salary,
          contact: optional(contact),
          address: optional(address),
          cnic: optional(cnic),
          employeePhoto,
          cnicPhoto,
          referenceName: optional(reference),
          status,
        },
      });
      navigation.goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    const ok = await confirmDestructive(
      'Deactivate employee',
      `${name.trim() || 'This employee'} moves to the inactive list and stops counting on the dashboard. Their record is kept.`,
      'Deactivate',
    );
    if (ok) void submit('inactive');
  };

  return (
    <>
      <FormScreen
        title={existing ? 'Edit Employee' : 'Add Employee'}
        onBack={navigation.goBack}
        saveLabel="Save Employee"
        canSave={canSave}
        saving={saving}
        onSave={() => void submit(existing?.status ?? 'active')}
        error={error}
      >
        <TextField
          label="Full Name"
          value={name}
          placeholder="Worker's full name"
          onChangeText={setName}
        />

        <PhotoField
          label="Employee Photo"
          prompt="Tap to photograph the employee"
          value={employeePhoto}
          onCapture={setEmployeePhoto}
        />

        <TextField
          label="CNIC"
          value={cnic}
          placeholder="XXXXX-XXXXXXX-X"
          onChangeText={setCnic}
        />

        <PhotoField
          label="CNIC Photo"
          prompt="Tap to photograph the CNIC"
          value={cnicPhoto}
          onCapture={setCnicPhoto}
        />

        <TextField
          label="Address"
          value={address}
          placeholder="House / street / area / city"
          onChangeText={setAddress}
          multiline
        />

        <TextField
          label="Reference Name"
          value={reference}
          placeholder="Name and relation (e.g. Tariq Mehmood, neighbor)"
          onChangeText={setReference}
        />

        <ChipField
          label="Role"
          options={ROLE_OPTIONS}
          selected={role}
          onSelect={pickRole}
        />

        {choosesBasis ? (
          <ChipField
            label="Salary Basis"
            options={BASIS_OPTIONS}
            selected={basis}
            onSelect={setBasis}
          />
        ) : (
          <StaticTextField label="Salary Basis" value={SALARY_BASIS_LABELS.fixed} />
        )}

        <PriceField
          label={SALARY_AMOUNT_LABELS[choosesBasis ? basis : 'fixed']}
          value={salaryFieldValue(choosesBasis ? basis : 'fixed', salary)}
          onPress={() => setKeypadOpen(true)}
        />

        <TextField
          label="Contact Number"
          value={contact}
          placeholder="03XX-XXXXXXX"
          onChangeText={setContact}
          keyboardType="phone-pad"
        />

        {/* Set by the database on insert and never editable afterwards, so a
            new employee reads "Today" rather than a date the form pretends to
            own. */}
        <StaticTextField
          label="Join Date"
          value={existing ? monthYear(existing.join_date) : 'Today'}
        />

        {existing ? (
          <View>
            {existing.status === 'active' ? (
              <Button
                label="Deactivate"
                tone="danger"
                icon="minus-circle"
                disabled={saving}
                onPress={() => void deactivate()}
              />
            ) : (
              <Button
                label="Reactivate"
                tone="secondary"
                icon="rotate-ccw"
                disabled={saving}
                onPress={() => void submit('active')}
              />
            )}
          </View>
        ) : null}
      </FormScreen>

      <NumericKeypadSheet
        visible={keypadOpen}
        title={SALARY_AMOUNT_LABELS[choosesBasis ? basis : 'fixed']}
        initialValue={salary?.toString() ?? ''}
        placeholder="Tap to set"
        maxLength={9}
        minLength={1}
        format={(digits) => formatRs(Number(digits))}
        onSubmit={(digits) => {
          setSalary(Number(digits));
          setKeypadOpen(false);
        }}
        onClose={() => setKeypadOpen(false)}
      />
    </>
  );
}
