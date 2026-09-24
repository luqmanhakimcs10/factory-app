import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import {
  exchangeDifference,
  fmt,
  isoDay as day,
  listExchanges,
  listStockReturns,
  poBucket,
  poTotal,
  unitsLabel,
  type PoBucket,
  type PurchaseOrder,
} from '../api';
import { AddButton, Chips, Mono, Note, Pill, Tag, type PillTone } from '../components';

export type StockInSub = 'po' | 'exchange' | 'return';

const BUCKET_PILL: Record<PoBucket, { label: string; tone: PillTone }> = {
  confirmed: { label: 'Confirmed', tone: 'good' },
  awaitingConfirmation: { label: 'Awaiting Confirmation', tone: 'warn' },
  awaitingProcurement: { label: 'Awaiting Procurement', tone: 'muted' },
};

export function StockInTab({
  factoryId,
  sub,
  onSub,
  pos,
  posLoading,
  onOpenPo,
  onNewPo,
  onNewExchange,
  onNewReturn,
}: {
  factoryId: string;
  sub: StockInSub;
  onSub: (next: StockInSub) => void;
  pos: PurchaseOrder[] | null;
  posLoading: boolean;
  onOpenPo: (id: string) => void;
  onNewPo: () => void;
  onNewExchange: () => void;
  onNewReturn: () => void;
}) {
  return (
    <View style={styles.body}>
      <Chips
        options={[
          { value: 'po', label: "PO's" },
          { value: 'exchange', label: 'Exchanges' },
          { value: 'return', label: 'Returns' },
        ]}
        selected={sub}
        onSelect={onSub}
      />
      {sub === 'po' ? (
        <POList pos={pos} loading={posLoading} onOpen={onOpenPo} onNew={onNewPo} />
      ) : null}
      {sub === 'exchange' ? <ExchangeList factoryId={factoryId} onNew={onNewExchange} /> : null}
      {sub === 'return' ? <ReturnList factoryId={factoryId} onNew={onNewReturn} /> : null}
    </View>
  );
}

function POList({
  pos,
  loading,
  onOpen,
  onNew,
}: {
  pos: PurchaseOrder[] | null;
  loading: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <>
      <AddButton label="Create Purchase Order" onPress={onNew} />
      {loading && !pos ? <ActivityIndicator color={colors.primary} /> : null}
      {pos && pos.length === 0 ? <EmptyState icon="inbox" title="No purchase orders yet." /> : null}
      {(pos ?? []).map((po) => {
        const bucket = poBucket(po.status);
        const supplier = po.actual_supplier?.name ?? po.supplier_name;
        const recommend = po.po_items.find((item) => item.recommended_supplier)?.recommended_supplier?.name;
        const n = po.po_items.length;
        return (
          <Pressable key={po.id} accessibilityRole="button" onPress={() => onOpen(po.id)} style={styles.card}>
            <View style={styles.between}>
              <Mono>{po.po_number}</Mono>
              <Pill label={BUCKET_PILL[bucket].label} tone={BUCKET_PILL[bucket].tone} />
            </View>
            <Text style={type.heading}>
              {`${n} item${n === 1 ? '' : 's'} · ${supplier ?? 'no supplier yet'}`}
            </Text>
            <Text style={type.caption}>
              {bucket === 'confirmed'
                ? `Received ${day(po.confirmed_at)} · Rs. ${fmt(poTotal(po))}`
                : bucket === 'awaitingConfirmation'
                  ? `Fulfilled ${day(po.submitted_at ?? po.date)} · confirm receipt to add stock`
                  : `Raised ${day(po.date)}${recommend ? ` · Recommend: ${recommend}` : ''}`}
            </Text>
            <Tag
              label={po.source === 'manual' ? 'Manual' : 'System-Generated'}
              tone={po.source === 'manual' ? 'amber' : 'navy'}
            />
          </Pressable>
        );
      })}
    </>
  );
}

function ExchangeList({ factoryId, onNew }: { factoryId: string; onNew: () => void }) {
  const fetcher = useCallback(() => listExchanges(factoryId), [factoryId]);
  const { data, loading, error } = useQuery(fetcher);
  return (
    <>
      <AddButton label="Create Exchange" onPress={onNew} />
      <Note text="An exchange is a purchase paid for in goods. Both legs are priced — what you gave is costed FIFO — and the difference is recorded, never posted to a ledger." />
      {loading && !data ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <EmptyState icon="alert-triangle" title="Could not load exchanges" hint={error.message} /> : null}
      {data && data.length === 0 ? <EmptyState icon="repeat" title="No exchanges yet." /> : null}
      {(data ?? []).map((x) => {
        const diff = exchangeDifference(x.exchange_lines);
        const leg = (d: 'gave' | 'got') =>
          x.exchange_lines
            .filter((line) => line.direction === d)
            .map((line) => `${line.stock_items.code} — ${fmt(line.qty)}`)
            .join(', ');
        return (
          <View key={x.id} style={styles.card}>
            <View style={styles.between}>
              <Mono>{x.code}</Mono>
              <Pill label="Completed" tone="good" />
            </View>
            <Text style={type.heading}>{x.party.name}</Text>
            <Text style={type.caption}>{`Gave ${leg('gave')} · Got ${leg('got')} · ${day(x.exchanged_at)}`}</Text>
            <Text style={[type.bodyStrong, { color: diff >= 0 ? colors.success : colors.danger }]}>
              {`Difference ${diff >= 0 ? '+' : '−'} Rs. ${fmt(Math.abs(diff))} ${diff >= 0 ? 'in your favour' : 'in their favour'}`}
            </Text>
          </View>
        );
      })}
    </>
  );
}

function ReturnList({ factoryId, onNew }: { factoryId: string; onNew: () => void }) {
  const fetcher = useCallback(() => listStockReturns(factoryId), [factoryId]);
  const { data, loading, error } = useQuery(fetcher);
  return (
    <>
      <AddButton label="Record Return from Order" onPress={onNew} />
      <Note tone="plain" text="Unused material coming back from a job card goes back to the lot it was issued from." />
      {loading && !data ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <EmptyState icon="alert-triangle" title="Could not load returns" hint={error.message} /> : null}
      {data && data.length === 0 ? <EmptyState icon="corner-up-left" title="No returns yet." /> : null}
      {(data ?? []).map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.between}>
            <Mono>{r.code}</Mono>
            <Pill label="Returned" tone="good" />
          </View>
          <Text style={type.heading}>{`${r.stock_items.code} — ${unitsLabel(r.stock_items.type, r.qty)}`}</Text>
          <Text style={type.caption}>
            {`From ${r.orders?.job_card_code ?? r.orders?.code ?? '—'} · into ${r.stock_items.code}@${r.party.name} · ${day(r.returned_at)}`}
          </Text>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.content, gap: spacing.block },
  card: {
    padding: spacing.content,
    gap: 6,
    borderRadius: radius.tile,
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
