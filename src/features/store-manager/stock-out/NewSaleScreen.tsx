import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import { getStockBook, listSales, recordSale } from '../api';
import { Chips, DetailShell, ErrorCard, FieldLabel } from '../components';
import { ItemPicker, newPick, pickReady, type PickDraft } from '../ItemPicker';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'NewSale'>;

/**
 * Record stock sold to an outside buyer. The customer is plain text — past
 * customers are offered as chips so a repeat buyer is one tap, not retyped.
 */
export function NewSaleScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id) as string;
  const fetcher = useCallback(
    () => Promise.all([getStockBook(factoryId), listSales(factoryId)]),
    [factoryId],
  );
  const { data, loading, error } = useQuery(fetcher);

  const [pick, setPick] = useState<PickDraft>(newPick());
  const [customer, setCustomer] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const book = data?.[0];
  if (!book) {
    return <DetailShell title="Record a Sale" onBack={navigation.goBack} loading={loading} error={error} />;
  }

  const past = [...new Set((data?.[1] ?? []).map((s) => s.customer_name))];
  const ready = pickReady({ book, draft: pick, mode: 'out', valueLabel: 'Sale value' }) && customer.trim() !== '';

  const submit = async () => {
    if (!pick.stockItemId) return;
    setSaving(true);
    setFailure(null);
    try {
      await recordSale({ stockItemId: pick.stockItemId, qty: pick.qty, value: pick.value, customer });
      navigation.goBack();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailShell
      title="Record a Sale"
      onBack={navigation.goBack}
      footer={
        <>
          <Button label="Cancel" tone="secondary" flex onPress={navigation.goBack} />
          <Button label="Confirm Sale" flex disabled={!ready} loading={saving} onPress={() => void submit()} />
        </>
      }
    >
      <ItemPicker book={book} draft={pick} onChange={setPick} mode="out" valueLabel="Sale value" />

      <View>
        <FieldLabel>Customer</FieldLabel>
        {past.length ? (
          <View style={styles.chips}>
            <Chips
              options={past.map((name) => ({ value: name, label: name }))}
              selected={past.includes(customer) ? customer : null}
              onSelect={setCustomer}
            />
          </View>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Buyer name"
          placeholderTextColor={colors.textMuted}
          value={customer}
          onChangeText={setCustomer}
        />
      </View>

      {failure ? <ErrorCard title="Could not record the sale" message={failure} /> : null}
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  chips: { marginBottom: spacing.tight },
  input: {
    ...type.body,
    height: 46,
    paddingHorizontal: spacing.content - 4,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
