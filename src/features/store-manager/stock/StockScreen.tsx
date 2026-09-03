import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { Card, EmptyState, StockRow, TabRow, type TabDef } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import type { StockType } from '../../../data/types';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import {
  isLowStock,
  listStockItems,
  stockComputedQuantity,
  stockLabel,
  stockQuantity,
  stockSwatch,
} from '../api';

const TYPES: TabDef<StockType>[] = [
  { key: 'thread', label: 'Thread' },
  { key: 'tilla', label: 'Tilla' },
  { key: 'sequin', label: 'Sequin' },
  { key: 'bobbin', label: 'Bobbin' },
];

const SECTION_LABELS: Record<StockType, string> = {
  thread: 'Thread Stock by Colour',
  tilla: 'Tilla Stock by Shade',
  sequin: 'Sequin Stock by Size · Type · Colour',
  // No screenshot for bobbin — this heading and the row layout below are a
  // best-effort default matching thread and tilla, not a confirmed design.
  bobbin: 'Bobbin Stock',
};

export interface StockScreenProps {
  onOpenItem: (stockItemId: string) => void;
}

export function StockScreen({ onOpenItem }: StockScreenProps) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const [stockType, setStockType] = useState<StockType>('thread');
  const [search, setSearch] = useState('');

  const fetcher = useCallback(
    () => listStockItems(factoryId as string, stockType, search),
    [factoryId, stockType, search],
  );
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  return (
    <View style={styles.container}>
      <TabRow tabs={TYPES} activeKey={stockType} onChange={setStockType} />

      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <Feather name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tap to search by code"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="search"
          />
          {search ? (
            <Feather
              name="x"
              size={16}
              color={colors.textMuted}
              onPress={() => setSearch('')}
            />
          ) : null}
        </View>
      </View>

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Could not load stock" hint={error.message} />
      ) : (
        <View style={styles.body}>
          <Text style={type.heading}>{SECTION_LABELS[stockType]}</Text>

          <Card>
            {!data || data.length === 0 ? (
              <EmptyState
                icon="package"
                title={search ? 'No match for that code' : 'Nothing in this category'}
                hint={search ? undefined : 'Stock added to this factory appears here.'}
              />
            ) : (
              data.map((item) => {
                const swatch = stockSwatch(item);
                return (
                  <StockRow
                    key={item.id}
                    colorId={swatch.colorId}
                    hex={swatch.hex}
                    label={stockLabel(item)}
                    code={item.code}
                    quantity={stockQuantity(item)}
                    computedQuantity={stockComputedQuantity(item)}
                    lowStock={isLowStock(item)}
                    onPress={() => onOpenItem(item.id)}
                  />
                );
              })
            )}
          </Card>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchWrap: {
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    paddingHorizontal: spacing.content - 4,
    height: 42,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: type.body.fontFamily,
    fontSize: 15,
    color: colors.textPrimary,
  },
  loader: {
    marginTop: spacing.content * 3,
  },
  body: {
    padding: spacing.content,
    gap: spacing.tight + 2,
  },
});
