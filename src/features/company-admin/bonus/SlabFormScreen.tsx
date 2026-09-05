import { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, NumericKeypadSheet } from '../../../components';
import { confirmDestructive } from '../../../lib/alert';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { FormScreen } from '../FormScreen';
import { PriceField } from '../components';
import { deleteBonusSlab, saveBonusSlab } from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'SlabForm'>;

/** Which of the two fields the keypad is currently editing. */
type Editing = 'threshold' | 'bonus' | null;

/**
 * One slab: a daily-stitch threshold and the bonus it pays.
 *
 * Presented as a modal route rather than a sheet inside the list screen. It is
 * the same thing to the user, and it keeps the numeric keypad — itself a modal
 * — from having to open on top of another one, which React Native's `Modal`
 * does not reliably do on either platform.
 *
 * Both fields are required and both must be above zero: a slab paying nothing,
 * or one anybody clears, is not a rule.
 */
export function SlabFormScreen({ navigation, route }: Props) {
  const { id, threshold: initialThreshold, bonusAmount: initialBonus } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [threshold, setThreshold] = useState<number | null>(initialThreshold ?? null);
  const [bonus, setBonus] = useState<number | null>(initialBonus ?? null);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = threshold !== null && threshold > 0 && bonus !== null && bonus > 0;

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      navigation.goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!canSave || !factoryId) return;
    void run(() =>
      saveBonusSlab({ factoryId, id, threshold, bonusAmount: bonus }),
    );
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirmDestructive(
      'Delete slab',
      'This bonus slab stops applying to every worker. Delete it?',
      'Delete',
    );
    if (ok) void run(() => deleteBonusSlab(id));
  };

  return (
    <>
      <FormScreen
        title={id ? 'Edit Slab' : 'Add Slab'}
        onBack={navigation.goBack}
        saveLabel="Save Slab"
        canSave={canSave}
        saving={saving}
        onSave={save}
        error={error}
      >
        <PriceField
          label="Daily-Stitch Threshold"
          value={
            threshold === null
              ? null
              : `${threshold.toLocaleString()} stitches/day`
          }
          onPress={() => setEditing('threshold')}
        />

        <PriceField
          label="Bonus Amount"
          value={bonus === null ? null : formatRs(bonus)}
          onPress={() => setEditing('bonus')}
        />

        {id ? (
          <View>
            <Button
              label="Delete Slab"
              tone="danger"
              icon="trash-2"
              disabled={saving}
              onPress={() => void remove()}
            />
          </View>
        ) : null}
      </FormScreen>

      <NumericKeypadSheet
        visible={editing !== null}
        title={editing === 'bonus' ? 'Bonus amount' : 'Daily-stitch threshold'}
        initialValue={
          editing === 'bonus'
            ? (bonus?.toString() ?? '')
            : (threshold?.toString() ?? '')
        }
        placeholder="Tap to set"
        maxLength={7}
        minLength={1}
        format={(digits) =>
          editing === 'bonus'
            ? formatRs(Number(digits))
            : `${Number(digits).toLocaleString()} stitches/day`
        }
        onSubmit={(digits) => {
          if (editing === 'bonus') setBonus(Number(digits));
          else setThreshold(Number(digits));
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
