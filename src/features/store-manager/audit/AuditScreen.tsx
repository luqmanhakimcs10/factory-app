import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  AuditSummaryCard,
  Button,
  DateFilterChips,
  EmptyState,
  dayKey,
  type DateFilterValue,
} from '../../../components';
import { colors, spacing } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import { listAuditRecords } from '../api';

export interface AuditScreenProps {
  onStartNewAudit: () => void;
  onOpenVariance: (auditRecordId: string) => void;
}

export function AuditScreen({ onStartNewAudit, onOpenVariance }: AuditScreenProps) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(null);

  const fetcher = useCallback(() => listAuditRecords(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const records = data ?? [];
  const dates = [...new Set(records.map((record) => dayKey(record.date)))];

  // The leading chip is "Latest" rather than "All": this tab shows one audit at
  // a time, not a list.
  const shown = dateFilter
    ? records.find((record) => dayKey(record.date) === dateFilter)
    : records[0];

  return (
    <View style={styles.container}>
      <DateFilterChips
        dates={dates}
        value={dateFilter}
        onChange={setDateFilter}
        allLabel="Latest"
      />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Could not load audits" hint={error.message} />
      ) : (
        <View style={styles.body}>
          {shown ? (
            <AuditSummaryCard
              date={new Date(shown.date).toLocaleDateString()}
              itemsChecked={shown.items_checked}
              itemsMatched={shown.items_matched}
              varianceCount={shown.variance_count}
              onPress={() => onOpenVariance(shown.id)}
            />
          ) : (
            <EmptyState
              icon="clipboard"
              title="No audits yet"
              hint="Start one to record a physical stock count."
            />
          )}

          <Button
            label="Start New Audit"
            tone="secondary"
            icon="plus"
            onPress={onStartNewAudit}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: spacing.content * 3,
  },
  body: {
    padding: spacing.content,
    gap: spacing.block,
  },
});
