import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, PhotoTile } from '../../../components';
import { colors, fonts, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import {
  TYPE_META,
  exchangeDifference,
  fmt,
  getStockBook,
  listParties,
  onHand,
  recordExchange,
} from '../api';
import { Chips, CodeBadge, DetailShell, ErrorCard, FieldLabel, Note, TotalCard } from '../components';
import { ItemPicker, newPick, pickReady, type PickDraft } from '../ItemPicker';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'NewExchange'>;

type Leg = 'gave' | 'got';
type Line = PickDraft & { stockItemId: string };

/**
 * A purchase paid for in goods. What we gave drains FIFO like a sale; what we
 * got becomes a lot keyed by the counterparty. The difference is shown, not
 * posted anywhere.
 */
export function NewExchangeScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id) as string;
  const fetcher = useCallback(
    () => Promise.all([getStockBook(factoryId), listParties(factoryId)]),
    [factoryId],
  );
  const { data, loading, error } = useQuery(fetcher);

  const [partyId, setPartyId] = useState<string | null>(null);
  const [legs, setLegs] = useState<Record<Leg, Line[]>>({ gave: [], got: [] });
  const [picking, setPicking] = useState<{ leg: Leg; draft: PickDraft } | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const book = data?.[0];
  if (!book) {
    return <DetailShell title="New Exchange" onBack={navigation.goBack} loading={loading} error={error} />;
  }
  const parties = (data?.[1] ?? []).filter((p) => p.status === 'active');
  const party = parties.find((p) => p.id === partyId);
  const codeOf = (id: string) => book.codes.find((c) => c.id === id)?.code ?? '?';

  if (picking) {
    const out = picking.leg === 'gave';
    // Several gave lines of one code must fit together, not each on its own.
    const alreadyGiven = legs.gave
      .filter((line) => line.stockItemId === picking.draft.stockItemId)
      .reduce((sum, line) => sum + line.qty, 0);
    const fits =
      !out || !picking.draft.stockItemId || picking.draft.qty + alreadyGiven <= onHand(book, picking.draft.stockItemId);
    const ready =
      pickReady({ book, draft: picking.draft, mode: out ? 'out' : 'in', valueLabel: 'Value' }) && fits;
    return (
      <DetailShell
        title={out ? 'What we gave' : 'What we received'}
        onBack={() => setPicking(null)}
        footer={
          <>
            <Button label="Cancel" tone="secondary" flex onPress={() => setPicking(null)} />
            <Button
              label="Add to Exchange"
              flex
              disabled={!ready}
              onPress={() => {
                const { stockItemId } = picking.draft;
                if (!stockItemId) return;
                setLegs({ ...legs, [picking.leg]: [...legs[picking.leg], { ...picking.draft, stockItemId }] });
                setPicking(null);
              }}
            />
          </>
        }
      >
        <ItemPicker
          book={book}
          draft={picking.draft}
          onChange={(draft) => setPicking({ ...picking, draft })}
          mode={out ? 'out' : 'in'}
          yardsLabel={out ? undefined : 'Yards per'}
          yardsHint="Each supplier's unit differs — asked at entry"
          valueLabel="Value of this leg"
        />
        {!fits ? <Note tone="warn" text="This exchange already gives some of this code; together they exceed what is on hand." /> : null}
      </DetailShell>
    );
  }

  const all = [
    ...legs.gave.map((l) => ({ direction: 'gave' as const, value: l.value })),
    ...legs.got.map((l) => ({ direction: 'got' as const, value: l.value })),
  ];
  const diff = exchangeDifference(all);
  const ready = partyId !== null && legs.gave.length > 0 && legs.got.length > 0 && photoUri !== null;

  const submit = async () => {
    if (!partyId || !photoUri) return;
    setSaving(true);
    setFailure(null);
    try {
      await recordExchange({
        factoryId,
        partyId,
        photoUri,
        lines: (['gave', 'got'] as Leg[]).flatMap((direction) =>
          legs[direction].map((line) => ({
            direction,
            stockItemId: line.stockItemId,
            qty: line.qty,
            unitYards: direction === 'got' && TYPE_META[line.type].hasYards ? line.yards : null,
            value: line.value,
          })),
        ),
      });
      navigation.goBack();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const legBlock = (leg: Leg, label: string) => (
    <View style={styles.gap}>
      <FieldLabel>{label}</FieldLabel>
      {legs[leg].length ? (
        legs[leg].map((line, ix) => (
          <View key={`${leg}-${ix}`} style={styles.item}>
            <CodeBadge code={codeOf(line.stockItemId)} small />
            <View style={styles.flex}>
              <Text style={type.bodyStrong}>{`${fmt(line.qty)} ${TYPE_META[line.type].unitPl}`}</Text>
              <Text style={type.caption}>
                {leg === 'gave' ? 'Costed FIFO from your oldest lot' : `Enters a lot from ${party?.name ?? '—'}`}
              </Text>
            </View>
            <Text style={styles.value}>{`Rs. ${fmt(line.value)}`}</Text>
            <Pressable
              accessibilityLabel="Remove line"
              hitSlop={8}
              onPress={() => setLegs({ ...legs, [leg]: legs[leg].filter((_, i) => i !== ix) })}
            >
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        ))
      ) : (
        <Note tone="plain" text="Nothing on this side yet." />
      )}
      <Pressable
        accessibilityRole="button"
        style={styles.add}
        onPress={() => setPicking({ leg, draft: newPick() })}
      >
        <Feather name="plus" size={17} color={colors.primary} />
        <Text style={[type.bodyStrong, { color: colors.primary }]}>Add Item</Text>
      </Pressable>
    </View>
  );

  return (
    <DetailShell
      title="New Exchange"
      onBack={navigation.goBack}
      footer={
        <>
          <Button label="Cancel" tone="secondary" flex onPress={navigation.goBack} />
          <Button label="Confirm Exchange" flex disabled={!ready} loading={saving} onPress={() => void submit()} />
        </>
      }
    >
      <View>
        <FieldLabel>Counterparty</FieldLabel>
        <Chips
          options={parties.map((p) => ({ value: p.id, label: `${p.name} · ${p.kind === 'factory' ? 'Factory' : 'Supplier'}` }))}
          selected={partyId}
          onSelect={setPartyId}
        />
      </View>

      {legBlock('gave', 'What we gave')}
      {legBlock('got', 'What we received')}

      {all.length ? (
        <>
          <TotalCard label="Difference" value={`${diff >= 0 ? '+' : '−'} Rs. ${fmt(Math.abs(diff))}`} />
          <Note
            text={`Recorded against ${party?.name ?? 'the counterparty'} and shown in item history. It is never posted to a ledger.`}
          />
        </>
      ) : null}

      <PhotoTile
        shape="wide"
        height={140}
        photoUri={photoUri}
        label={photoUri ? 'Photo attached' : 'Add photo — required on every custody transfer'}
        onCapture={setPhotoUri}
      />

      {failure ? <ErrorCard title="Could not record the exchange" message={failure} /> : null}
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.tight },
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
  value: { fontFamily: fonts.mono.semibold, fontSize: 14, color: colors.textPrimary },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight,
    height: 44,
    borderRadius: radius.card,
    backgroundColor: colors.neutralAccent,
  },
});
