import { useCallback, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, EmptyState, NumericKeypadSheet, Stepper } from '../../../components';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import { TYPE_META, fmt, listReturnables, recordStockReturn } from '../api';
import { Chips, DetailShell, ErrorCard, FieldLabel, Note, TapField } from '../components';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'NewReturn'>;

/**
 * Leftover material back from a job. Only what is actually out on the floor is
 * offered: order, then code, then whose lot it came from — and it goes back
 * into that same lot, so no yards or price is asked for again.
 */
export function NewReturnScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id) as string;
  const fetcher = useCallback(() => listReturnables(factoryId), [factoryId]);
  const { data, loading, error } = useQuery(fetcher);

  const [orderId, setOrderId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [keypad, setKeypad] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!data) {
    return <DetailShell title="Return from Order" onBack={navigation.goBack} loading={loading} error={error} />;
  }

  const orders = [...new Map(data.map((r) => [r.orderId, r.orderLabel]))];
  const forOrder = data.filter((r) => r.orderId === orderId);
  const codes = [...new Map(forOrder.map((r) => [r.stockItemId, r]))].map(([, r]) => r);
  const forCode = forOrder.filter((r) => r.stockItemId === itemId);
  const row = forCode.find((r) => r.partyId === partyId) ?? null;
  const unitPl = row ? TYPE_META[row.type].unitPl : 'units';
  const ready = row !== null && qty >= 1 && qty <= row.outstanding;

  const submit = async () => {
    if (!row) return;
    setSaving(true);
    setFailure(null);
    try {
      await recordStockReturn({ orderId: row.orderId, stockItemId: row.stockItemId, partyId: row.partyId, qty });
      navigation.goBack();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailShell
      title="Return from Order"
      onBack={navigation.goBack}
      footer={
        <>
          <Button label="Cancel" tone="secondary" flex onPress={navigation.goBack} />
          <Button label="Return to Stock" flex disabled={!ready} loading={saving} onPress={() => void submit()} />
        </>
      }
    >
      {data.length === 0 ? (
        <EmptyState icon="corner-up-left" title="Nothing is out on the floor" hint="Issued material shows up here once a job has been issued." />
      ) : (
        <>
          <View>
            <FieldLabel>Order</FieldLabel>
            <Chips
              options={orders.map(([value, label]) => ({ value, label }))}
              selected={orderId}
              onSelect={(next) => {
                setOrderId(next);
                setItemId(null);
                setPartyId(null);
              }}
            />
          </View>

          {orderId ? (
            <View>
              <FieldLabel>Code</FieldLabel>
              <Chips
                options={codes.map((r) => ({ value: r.stockItemId, label: `${r.code} · ${TYPE_META[r.type].label}` }))}
                selected={itemId}
                onSelect={(next) => {
                  setItemId(next);
                  setPartyId(null);
                }}
              />
            </View>
          ) : null}

          {itemId ? (
            <View>
              <FieldLabel>Returning to which lot owner</FieldLabel>
              <Chips
                options={forCode.map((r) => ({ value: r.partyId, label: `${r.party} · ${fmt(r.outstanding)} out` }))}
                selected={partyId}
                onSelect={setPartyId}
              />
            </View>
          ) : null}

          {row ? (
            <View>
              <FieldLabel>{`Quantity — ${unitPl}`}</FieldLabel>
              <Stepper value={qty} onChange={setQty} min={1} max={row.outstanding} bigStep={10} />
              <TapField icon="hash" value={`${fmt(qty)} ${unitPl}`} hint="Tap to type an exact quantity" onPress={() => setKeypad(true)} />
              {qty > row.outstanding ? (
                <Note tone="warn" text={`Only ${fmt(row.outstanding)} ${unitPl} of this lot went out to this order.`} />
              ) : null}
            </View>
          ) : null}
        </>
      )}

      <Note tone="plain" text="Unused material coming back from a job card goes back to the lot it was issued from." />
      {failure ? <ErrorCard title="Could not record the return" message={failure} /> : null}

      <NumericKeypadSheet
        visible={keypad}
        title="Quantity returned"
        initialValue=""
        placeholder="—"
        maxLength={6}
        minLength={1}
        format={(digits) => fmt(Number(digits))}
        onSubmit={(digits) => {
          setQty(Math.max(1, Number(digits)));
          setKeypad(false);
        }}
        onClose={() => setKeypad(false)}
      />
    </DetailShell>
  );
}
