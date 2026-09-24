import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, EmptyState } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import { TYPE_META, createPurchaseOrder, fmt, getStockBook, listParties } from '../api';
import { CodeBadge, DetailShell, ErrorCard, Note } from '../components';
import { ItemPicker, newPick, type PickDraft } from '../ItemPicker';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'NewPurchaseOrder'>;

interface DraftLine extends PickDraft {
  stockItemId: string;
}

/**
 * Raise a manual PO: build a cart of lines, submit once. Quantities and the
 * yards per unit asked for — no prices; Procurement records what was bought.
 */
export function NewPurchaseOrderScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id) as string;
  const fetcher = useCallback(
    () => Promise.all([getStockBook(factoryId), listParties(factoryId)]),
    [factoryId],
  );
  const { data, loading, error } = useQuery(fetcher);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pick, setPick] = useState<PickDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const book = data?.[0];
  const suppliers = (data?.[1] ?? []).filter((p) => p.kind === 'supplier' && p.status === 'active');
  const codeOf = (id: string) => book?.codes.find((c) => c.id === id);

  if (!book) {
    return <DetailShell title="New Purchase Order" onBack={navigation.goBack} loading={loading} error={error} />;
  }

  if (pick) {
    const ready = pick.stockItemId !== null && pick.qty >= 1;
    return (
      <DetailShell
        title="Add Item"
        onBack={() => setPick(null)}
        footer={
          <>
            <Button label="Cancel" tone="secondary" flex onPress={() => setPick(null)} />
            <Button
              label="Add to Purchase Order"
              flex
              disabled={!ready}
              onPress={() => {
                if (!pick.stockItemId) return;
                setLines([...lines, { ...pick, stockItemId: pick.stockItemId }]);
                setPick(null);
              }}
            />
          </>
        }
      >
        <ItemPicker
          book={book}
          draft={pick}
          onChange={setPick}
          mode="in"
          yardsLabel="Yards per"
          yardsHint="What you are asking for. Procurement records what they actually buy."
          partyLabel="Recommend supplier"
          parties={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Text style={type.caption}>A suggestion only. Procurement records the supplier they actually buy from.</Text>
      </DetailShell>
    );
  }

  const submit = async () => {
    setSaving(true);
    setFailure(null);
    try {
      await createPurchaseOrder(
        lines.map((line) => ({
          stockItemId: line.stockItemId,
          qty: line.qty,
          askYards: TYPE_META[line.type].hasYards ? line.yards : null,
          recommendedSupplierId: line.party,
        })),
      );
      navigation.goBack();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailShell
      title="New Purchase Order"
      trailing="Manual"
      onBack={navigation.goBack}
      footer={
        <>
          <Button label="Cancel" tone="secondary" flex onPress={navigation.goBack} />
          <Button
            label="Submit Purchase Order"
            flex
            disabled={lines.length === 0}
            loading={saving}
            onPress={() => void submit()}
          />
        </>
      }
    >
      {lines.length === 0 ? (
        <EmptyState icon="shopping-cart" title='Nothing added yet. Tap "Add an Item" to build this purchase order.' />
      ) : (
        lines.map((line, ix) => {
          const meta = TYPE_META[line.type];
          const recommend = suppliers.find((s) => s.id === line.party)?.name;
          return (
            <View key={`${line.stockItemId}-${ix}`} style={styles.item}>
              <CodeBadge code={codeOf(line.stockItemId)?.code ?? '?'} small />
              <View style={styles.flex}>
                <Text style={type.bodyStrong}>{`${fmt(line.qty)} ${meta.unitPl}`}</Text>
                <Text style={type.caption}>
                  {`${meta.hasYards ? `${fmt(line.yards)} yd per ${meta.unit} requested` : 'No length measure'}${
                    recommend ? ` · Recommend: ${recommend}` : ''
                  }`}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Remove item"
                hitSlop={8}
                onPress={() => setLines(lines.filter((_, i) => i !== ix))}
              >
                <Feather name="x" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          );
        })
      )}

      <Pressable accessibilityRole="button" style={styles.add} onPress={() => setPick(newPick())}>
        <Feather name="plus" size={17} color={colors.primary} />
        <Text style={[type.bodyStrong, { color: colors.primary }]}>
          {lines.length ? 'Add Another Item' : 'Add an Item'}
        </Text>
      </Pressable>

      <Note tone="plain" text="All items on this PO move through fulfilment and confirmation together as one record." />
      {failure ? <ErrorCard title="Could not submit" message={failure} /> : null}
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 4,
    padding: spacing.tight + 4,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight,
    height: 48,
    borderRadius: radius.card,
    backgroundColor: colors.neutralAccent,
  },
});
