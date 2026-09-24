import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { Card, EmptyState, NumericKeypadSheet } from '../../../components';
import { colors, fonts, layout, radius, spacing, type } from '../../../theme';
import type { StockType } from '../../../data/types';
import { useQuery } from '../../../data/useQuery';
import {
  STOCK_TYPES,
  TYPE_META,
  getStockBook,
  openLotsOf,
  qtyLine,
  stockStatus,
  type StockStatus,
} from '../api';
import { Chips, CodeBadge, FieldLabel, Note, Pill } from '../components';

type StatusFilter = 'all' | StockStatus;

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  in: 'In Stock',
  low: 'Low',
  empty: 'Empty',
};

/** Browse codes by type, filter by code and status. Quantities come from lots. */
export function StockTab({
  factoryId,
  onOpenItem,
}: {
  factoryId: string;
  onOpenItem: (stockItemId: string) => void;
}) {
  const [stockType, setStockType] = useState<StockType>('thread');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [keypad, setKeypad] = useState(false);

  const fetcher = useCallback(() => getStockBook(factoryId), [factoryId]);
  const { data: book, loading, error } = useQuery(fetcher);

  if (loading && !book) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (error || !book) {
    return <EmptyState icon="alert-triangle" title="Could not load stock" hint={error?.message} />;
  }

  const codes = book.codes.filter((code) => code.type === stockType);
  const counts: Record<StatusFilter, number> = { all: codes.length, in: 0, low: 0, empty: 0 };
  codes.forEach((code) => counts[stockStatus(book, code)]++);

  const visible = codes
    .filter((code) => status === 'all' || stockStatus(book, code) === status)
    .filter((code) => !query || code.code.startsWith(query));

  return (
    <View style={styles.body}>
      <View>
        <FieldLabel>Inventory Type</FieldLabel>
        <Chips
          options={STOCK_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label }))}
          selected={stockType}
          onSelect={(next) => {
            setStockType(next);
            setQuery('');
          }}
        />
      </View>

      <View>
        <FieldLabel>Search by Code</FieldLabel>
        <View style={styles.searchRow}>
          <Pressable accessibilityRole="search" style={styles.search} onPress={() => setKeypad(true)}>
            <Feather name="search" size={16} color={colors.primary} />
            <Text style={query ? type.bodyStrong : [type.body, { color: colors.textMuted }]}>
              {query ? `Code ${query}` : 'Tap to search by code'}
            </Text>
          </Pressable>
          {query ? (
            <Pressable accessibilityLabel="Clear code search" style={styles.clear} onPress={() => setQuery('')}>
              <Feather name="x" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View>
        <FieldLabel>Stock Status</FieldLabel>
        <Chips
          options={(['all', 'in', 'low', 'empty'] as StatusFilter[]).map((key) => ({
            value: key,
            label: `${STATUS_LABELS[key]} ${counts[key]}`,
          }))}
          selected={status}
          onSelect={setStatus}
          alarm={counts.empty > 0 ? ['empty'] : []}
        />
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="package"
          title={`No ${TYPE_META[stockType].label.toLowerCase()} codes match this filter.`}
        />
      ) : (
        <Card>
          {visible.map((code) => {
            const st = stockStatus(book, code);
            const lots = openLotsOf(book, code.id).length;
            return (
              <Pressable
                key={code.id}
                accessibilityRole="button"
                onPress={() => onOpenItem(code.id)}
                style={styles.row}
              >
                <CodeBadge code={code.code} />
                <View style={styles.info}>
                  <Text style={styles.qty}>{qtyLine(book, code)}</Text>
                  <Text style={styles.sub}>{`${lots} lot${lots === 1 ? '' : 's'} · ${code.label}`}</Text>
                </View>
                {st === 'low' ? <Pill label="Low" tone="danger" /> : null}
                {st === 'empty' ? <Pill label="Empty" tone="muted" /> : null}
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </Card>
      )}

      {counts.empty > 0 ? (
        <Note text="Empty means what you ran out of. A code never purchased has no row here at all." />
      ) : null}

      <NumericKeypadSheet
        visible={keypad}
        title="Search by code"
        initialValue={query}
        placeholder="—"
        maxLength={5}
        onSubmit={(digits) => {
          setQuery(digits);
          setKeypad(false);
        }}
        onClose={() => setKeypad(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.content * 3 },
  body: { padding: spacing.content, gap: spacing.block },
  searchRow: { flexDirection: 'row', gap: spacing.tight },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    height: 46,
    paddingHorizontal: spacing.content - 2,
    borderRadius: radius.card,
    backgroundColor: colors.controlBg,
  },
  clear: {
    width: 46,
    height: 46,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.controlBg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 4,
    paddingVertical: spacing.content - 2,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  info: { flex: 1, gap: 2 },
  qty: { fontFamily: fonts.mono.semibold, fontSize: 15, color: colors.textPrimary },
  sub: { fontFamily: fonts.mono.medium, fontSize: 12, color: colors.textSecondary },
});
