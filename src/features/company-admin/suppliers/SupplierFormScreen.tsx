import { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../../../components';
import { confirmDestructive } from '../../../lib/alert';
import type { StockType } from '../../../data/types';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { FormScreen } from '../FormScreen';
import { ChipField, TextField } from '../components';
import {
  INVENTORY_TYPES,
  INVENTORY_TYPE_LABELS,
  PAYMENT_CYCLES,
  PAYMENT_CYCLE_LABELS,
  saveSupplier,
  type PaymentCycle,
  type RosterStatus,
} from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'SupplierForm'>;

const TYPE_OPTIONS = INVENTORY_TYPES.map((entry) => ({
  value: entry,
  label: INVENTORY_TYPE_LABELS[entry],
}));

const CYCLE_OPTIONS = PAYMENT_CYCLES.map((entry) => ({
  value: entry,
  label: PAYMENT_CYCLE_LABELS[entry],
}));

function optional(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

/**
 * Add or edit one supplier.
 *
 * The shortest form in the module, and there is no money field on it at all —
 * see the note on the list screen. `inventory_type` reuses Store Manager's own
 * `stock_type` enum rather than a parallel list, so a supplier's category and
 * the stock ledger's cannot drift apart.
 */
export function SupplierFormScreen({ navigation, route }: Props) {
  const existing = route.params.supplier;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [name, setName] = useState(existing?.name ?? '');
  const [contact, setContact] = useState(existing?.contact ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [inventoryType, setInventoryType] = useState<StockType | null>(
    existing?.inventory_type ?? null,
  );
  const [cycle, setCycle] = useState<PaymentCycle | null>(existing?.payment_cycle ?? null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && inventoryType !== null && cycle !== null;

  const submit = async (status: RosterStatus) => {
    if (!canSave || !factoryId || !inventoryType || !cycle) return;

    setSaving(true);
    setError(null);
    try {
      await saveSupplier({
        factoryId,
        id: existing?.id,
        input: {
          name: name.trim(),
          contact: optional(contact),
          address: optional(address),
          inventoryType,
          paymentCycle: cycle,
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
      'Deactivate supplier',
      `${name.trim() || 'This supplier'} stops appearing as a purchasing option. Past purchase orders keep pointing at them.`,
      'Deactivate',
    );
    if (ok) void submit('inactive');
  };

  return (
    <FormScreen
      title={existing ? 'Edit Supplier' : 'Add Supplier'}
      onBack={navigation.goBack}
      saveLabel="Save Supplier"
      canSave={canSave}
      saving={saving}
      onSave={() => void submit(existing?.status ?? 'active')}
      error={error}
    >
      <TextField
        label="Supplier Name"
        value={name}
        placeholder="Business name"
        onChangeText={setName}
      />

      <TextField
        label="Contact Number"
        value={contact}
        placeholder="03XX-XXXXXXX"
        onChangeText={setContact}
        keyboardType="phone-pad"
      />

      <TextField
        label="Address"
        value={address}
        placeholder="Shop / street / area / city"
        onChangeText={setAddress}
        multiline
      />

      <ChipField
        label="Inventory Type"
        options={TYPE_OPTIONS}
        selected={inventoryType}
        onSelect={setInventoryType}
      />

      <ChipField
        label="Payment Cycle"
        options={CYCLE_OPTIONS}
        selected={cycle}
        onSelect={setCycle}
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
  );
}
