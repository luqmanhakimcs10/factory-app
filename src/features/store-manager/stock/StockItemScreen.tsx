import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card, EmptyState } from '../../../components';
import { colors, fonts, layout, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import {
  TYPE_META,
  fmt,
  getItemHistory,
  getStockBook,
  isoDay,
  lotsOf,
  openLotsOf,
  qtyLine,
  stockStatus,
} from '../api';
import { Chips, CodeBadge, DetailShell, FieldLabel, Note, Pill } from '../components';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'StockItem'>;

/** One code: its total, its lots in the order they drain, every movement. */
export function StockItemScreen({ navigation, route }: Props) {
  const { stockItemId } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id) as string;
  const [partyFilter, setPartyFilter] = useState('all');

  const fetcher = useCallback(
    () => Promise.all([getStockBook(factoryId), getItemHistory(stockItemId)]),
    [factoryId, stockItemId],
  );
  const { data, loading, error } = useQuery(fetcher);

  const book = data?.[0];
  const history = data?.[1] ?? [];
  const code = book?.codes.find((c) => c.id === stockItemId);

  if (!book || !code) {
    return (
      <DetailShell title="Code" onBack={navigation.goBack} loading={loading} error={error}>
        <EmptyState icon="package" title="Code not found" />
      </DetailShell>
    );
  }

  const meta = TYPE_META[code.type];
  const st = stockStatus(book, code);
  const lots = lotsOf(book, code.id);
  const next = openLotsOf(book, code.id)[0];
  const parties = [...new Set(lots.map((lot) => lot.party.name))];
  const shown = history.filter((h) => partyFilter === 'all' || h.party === partyFilter);

  return (
    <DetailShell title={`Code ${code.code}`} trailing={meta.label} onBack={navigation.goBack}>
      <View style={styles.summary}>
        <CodeBadge code={code.code} />
        <View style={styles.flex}>
          <Text style={type.caption}>TOTAL ON HAND</Text>
          <Text style={styles.total}>{qtyLine(book, code)}</Text>
          <Text style={type.caption}>{code.label}</Text>
        </View>
        {st === 'low' ? (
          <Pill label="Low" tone="danger" />
        ) : st === 'empty' ? (
          <Pill label="Empty" tone="muted" />
        ) : (
          <Pill label="In stock" tone="good" />
        )}
      </View>

      <View>
        <FieldLabel>Lots</FieldLabel>
        <Card>
          {lots.length === 0 ? (
            <EmptyState icon="layers" title="No lots yet" hint="Confirm a purchase order to create one." />
          ) : (
            lots.map((lot) => (
              <View key={lot.id} style={[styles.lot, lot.qty === 0 && styles.drained]}>
                <View style={styles.flex}>
                  <Text style={type.bodyStrong}>{lot.party.name}</Text>
                  <Text style={type.caption}>
                    {`${lot.party.kind === 'factory' ? 'Factory' : 'Supplier'} · ${isoDay(lot.received_at)}${
                      lot.price ? ` · Rs. ${fmt(lot.price)}` : ''
                    }`}
                  </Text>
                  <Text style={styles.lotQty}>
                    {lot.qty === 0
                      ? '0 remaining — drained'
                      : `${fmt(lot.qty)} ${meta.unitPl}${
                          meta.hasYards && lot.unit_yards
                            ? ` · ${fmt(lot.qty * lot.unit_yards)} yd · ${fmt(lot.unit_yards)} yd/${meta.unit}`
                            : ''
                        }`}
                  </Text>
                </View>
                {next?.id === lot.id ? <Pill label="Goes out next" tone="good" /> : null}
              </View>
            ))
          )}
        </Card>
      </View>

      <Note text="Oldest goes out first. You never pick a lot — the system drains them in order and reports whose stock went." />

      <View>
        <FieldLabel>History</FieldLabel>
        <Chips
          options={[
            { value: 'all', label: 'All lots' },
            ...parties.map((p) => ({ value: p, label: `@${p.split(' ')[0]}` })),
          ]}
          selected={partyFilter}
          onSelect={setPartyFilter}
        />
      </View>

      {shown.length ? (
        <Card>
          {shown.map((h) => (
            <View key={h.id} style={styles.hist}>
              <View style={[styles.dir, { backgroundColor: h.dir === 'in' ? colors.successBg : colors.dangerBg }]}>
                <Feather
                  name={h.dir === 'in' ? 'arrow-left' : 'arrow-right'}
                  size={15}
                  color={h.dir === 'in' ? colors.success : colors.danger}
                />
              </View>
              <View style={styles.flex}>
                <Text style={type.bodyStrong}>{h.title}</Text>
                <Text style={type.caption}>{`${code.code}@${h.party} · ${isoDay(h.at)}`}</Text>
              </View>
              <Text style={[styles.histQty, { color: h.dir === 'in' ? colors.success : colors.danger }]}>
                {`${h.dir === 'in' ? '+' : '−'}${fmt(h.qty)}`}
              </Text>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState icon="clock" title="No movements for this lot filter." />
      )}
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 4,
    padding: spacing.content,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  total: { fontFamily: fonts.mono.semibold, fontSize: 18, color: colors.textPrimary },
  lot: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.tight,
    paddingVertical: spacing.content - 4,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  drained: { opacity: 0.5 },
  lotQty: { fontFamily: fonts.mono.semibold, fontSize: 14, color: colors.textPrimary, marginTop: 2 },
  hist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 4,
    paddingVertical: spacing.tight + 4,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  dir: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  histQty: { fontFamily: fonts.mono.bold, fontSize: 15 },
});
