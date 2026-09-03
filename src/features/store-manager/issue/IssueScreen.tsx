import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import {
  DateFilterChips,
  EmptyState,
  IssueCard,
  dayKey,
  type DateFilterValue,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import { getIssueQueue, type IssueOrder } from '../api';

export interface IssueScreenProps {
  onOpenOrder: (orderId: string) => void;
}

export function IssueScreen({ onOpenOrder }: IssueScreenProps) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(null);

  const fetcher = useCallback(() => getIssueQueue(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const matchesSearch = (order: IssueOrder) =>
    order.code.toLowerCase().includes(search.trim().toLowerCase());

  const issued = (data?.issuedThisWeek ?? []).filter(matchesSearch);
  const ready = (data?.readyToIssue ?? []).filter(matchesSearch);

  // Only issued orders carry a date worth filtering on.
  const dates = [
    ...new Set(
      issued
        .map((order) => order.issued_date)
        .filter((value): value is string => value !== null)
        .map(dayKey),
    ),
  ];

  const visibleIssued = dateFilter
    ? issued.filter((order) => order.issued_date && dayKey(order.issued_date) === dateFilter)
    : issued;

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <Feather name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by order number"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
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

      <DateFilterChips dates={dates} value={dateFilter} onChange={setDateFilter} />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Could not load the queue" hint={error.message} />
      ) : (
        <View style={styles.body}>
          <Text style={type.heading}>Ready to Issue</Text>
          {ready.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="Nothing to issue"
              hint="Orders appear here when a floor manager requests their materials."
            />
          ) : (
            ready.map((order) => (
              <IssueCard
                key={order.id}
                orderCode={order.code}
                clientName={order.clients?.name ?? 'Unknown client'}
                designCode={order.design_code}
                swatches={(order.materials ?? []).map((entry) => ({
                  colorId: entry.color_id,
                }))}
                state="ready"
                onPress={() => onOpenOrder(order.id)}
              />
            ))
          )}

          <Text style={[type.heading, styles.sectionGap]}>Issued This Week</Text>
          {visibleIssued.length === 0 ? (
            <EmptyState icon="sunrise" title="Nothing issued yet" />
          ) : (
            visibleIssued.map((order) => (
              <IssueCard
                key={order.id}
                orderCode={order.code}
                clientName={order.clients?.name ?? 'Unknown client'}
                designCode={order.design_code}
                swatches={(order.materials ?? []).map((entry) => ({
                  colorId: entry.color_id,
                }))}
                state="issued"
                issuedBy={order.issued_profile?.full_name}
              />
            ))
          )}
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
    paddingTop: spacing.content,
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
    gap: spacing.block,
  },
  sectionGap: {
    marginTop: spacing.tight,
  },
});
