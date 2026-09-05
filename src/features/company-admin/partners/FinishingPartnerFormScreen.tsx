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
  FINISHING_STAGES,
  FINISHING_STAGE_LABELS,
  saveFinishingPartner,
  type FinishingStage,
  type RosterStatus,
} from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'FinishingPartnerForm'>;

const STAGE_OPTIONS = FINISHING_STAGES.map((stage) => ({
  value: stage,
  label: FINISHING_STAGE_LABELS[stage],
}));

function optional(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

/**
 * Add or edit one finishing partner.
 *
 * **Rate Basis is a static field, deliberately, and must stay one.** The
 * `partner_rate_basis` enum has exactly one value: a second basis was removed
 * from the spec on purpose, and the migration keeps the column an enum only so
 * one could be added later without a rewrite. Rendering a picker here would put
 * a choice on screen that the database has no second option for.
 *
 * Name, stage and rate are required — a partner with no stage cannot be
 * assigned work, and one with no rate cannot be paid for it.
 */
export function FinishingPartnerFormScreen({ navigation, route }: Props) {
  const existing = route.params.partner;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [name, setName] = useState(existing?.name ?? '');
  const [cnic, setCnic] = useState(existing?.cnic ?? '');
  const [cnicPhoto, setCnicPhoto] = useState<string | null>(existing?.cnic_photo_url ?? null);
  const [address, setAddress] = useState(existing?.address ?? '');
  const [stage, setStage] = useState<FinishingStage | null>(existing?.stage_type ?? null);
  const [rate, setRate] = useState<number | null>(existing?.rate ?? null);
  const [contact, setContact] = useState(existing?.contact ?? '');

  const [keypadOpen, setKeypadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && stage !== null && rate !== null && rate > 0;

  const submit = async (status: RosterStatus) => {
    if (!canSave || !factoryId || !stage || rate === null) return;

    setSaving(true);
    setError(null);
    try {
      await saveFinishingPartner({
        factoryId,
        id: existing?.id,
        input: {
          name: name.trim(),
          stage,
          rate,
          contact: optional(contact),
          address: optional(address),
          cnic: optional(cnic),
          cnicPhoto,
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
      'Deactivate partner',
      `${name.trim() || 'This partner'} stops appearing as a finishing option and is left out of per-order finishing costs.`,
      'Deactivate',
    );
    if (ok) void submit('inactive');
  };

  return (
    <>
      <FormScreen
        title={existing ? 'Edit Finishing Partner' : 'Add Finishing Partner'}
        onBack={navigation.goBack}
        saveLabel="Save Finishing Partner"
        canSave={canSave}
        saving={saving}
        onSave={() => void submit(existing?.status ?? 'active')}
        error={error}
      >
        <TextField
          label="Name"
          value={name}
          placeholder="Business or contact person's name"
          onChangeText={setName}
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
          placeholder="Shop / street / area / city"
          onChangeText={setAddress}
          multiline
        />

        <ChipField
          label="Stage"
          options={STAGE_OPTIONS}
          selected={stage}
          onSelect={setStage}
        />

        <StaticTextField label="Rate Basis" value="Per Repeat" />

        <PriceField
          label="Rate per Repeat (Rs.)"
          value={rate === null ? null : `${formatRs(rate)} /repeat`}
          onPress={() => setKeypadOpen(true)}
        />

        <TextField
          label="Contact Number"
          value={contact}
          placeholder="03XX-XXXXXXX"
          onChangeText={setContact}
          keyboardType="phone-pad"
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
        title="Rate per repeat"
        initialValue={rate?.toString() ?? ''}
        placeholder="Tap to set"
        maxLength={7}
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
