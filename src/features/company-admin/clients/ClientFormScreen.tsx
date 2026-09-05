import { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, NumericKeypadSheet } from '../../../components';
import { confirmDestructive } from '../../../lib/alert';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { FormScreen } from '../FormScreen';
import { ChipField, PriceField, TextField } from '../components';
import {
  BILLING_RATE_LABELS,
  BILLING_TYPES,
  BILLING_TYPE_LABELS,
  PAYMENT_CYCLES,
  PAYMENT_CYCLE_LABELS,
  saveClient,
  type BillingType,
  type PaymentCycle,
  type RosterStatus,
} from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'ClientForm'>;

const BILLING_OPTIONS = BILLING_TYPES.map((entry) => ({
  value: entry,
  label: BILLING_TYPE_LABELS[entry],
}));

const CYCLE_OPTIONS = PAYMENT_CYCLES.map((entry) => ({
  value: entry,
  label: PAYMENT_CYCLE_LABELS[entry],
}));

function optional(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

/**
 * Add or edit one client, terms included.
 *
 * These are the terms `submit_order` stamps onto an order at intake, so what is
 * set here decides what every future order for this client is worth — and does
 * not touch orders already submitted, which keep the rate they were taken at.
 *
 * The rate field's label follows the billing type because the two numbers are
 * not comparable: one is money per repeat, the other money per thousand
 * stitches, and a field labelled just "Rate" invites entering one as the other.
 * Contact number is required here and nowhere else in the module: `clients.phone`
 * is NOT NULL, having been created by an intake flow that always captures it.
 */
export function ClientFormScreen({ navigation, route }: Props) {
  const existing = route.params.client;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [billing, setBilling] = useState<BillingType | null>(existing?.billing_type ?? null);
  const [rate, setRate] = useState<number | null>(existing?.rate ?? null);
  const [cycle, setCycle] = useState<PaymentCycle | null>(existing?.payment_cycle ?? null);

  const [keypadOpen, setKeypadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    billing !== null &&
    rate !== null &&
    rate > 0 &&
    cycle !== null;

  const submit = async (status: RosterStatus) => {
    if (!canSave || !factoryId || !billing || !cycle || rate === null) return;

    setSaving(true);
    setError(null);
    try {
      await saveClient({
        factoryId,
        id: existing?.id,
        input: {
          name: name.trim(),
          phone: phone.trim(),
          address: optional(address),
          billingType: billing,
          rate,
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
      'Deactivate client',
      `${name.trim() || 'This client'} moves to the inactive list. Their existing orders and invoices are untouched.`,
      'Deactivate',
    );
    if (ok) void submit('inactive');
  };

  return (
    <>
      <FormScreen
        title={existing ? 'Edit Client' : 'Add Client'}
        onBack={navigation.goBack}
        saveLabel="Save Client"
        canSave={canSave}
        saving={saving}
        onSave={() => void submit(existing?.status ?? 'active')}
        error={error}
      >
        <TextField
          label="Client Name"
          value={name}
          placeholder="Business name"
          onChangeText={setName}
        />

        <TextField
          label="Contact Number"
          value={phone}
          placeholder="03XX-XXXXXXX"
          onChangeText={setPhone}
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
          label="Billing Type"
          options={BILLING_OPTIONS}
          selected={billing}
          onSelect={setBilling}
        />

        <PriceField
          label={billing ? BILLING_RATE_LABELS[billing] : 'Rate (Rs.)'}
          value={rate === null ? null : formatRs(rate)}
          onPress={() => setKeypadOpen(true)}
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

      <NumericKeypadSheet
        visible={keypadOpen}
        title={billing ? BILLING_RATE_LABELS[billing] : 'Rate'}
        initialValue={rate?.toString() ?? ''}
        placeholder="Tap to set"
        maxLength={9}
        minLength={1}
        format={(digits) => formatRs(Number(digits))}
        onSubmit={(digits) => {
          setRate(Number(digits));
          setKeypadOpen(false);
        }}
        onClose={() => setKeypadOpen(false)}
      />
    </>
  );
}
