import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card, EmptyState } from '../../../components';
import { colors, spacing } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { TYPE_META, fmt, isoDay, listAudits } from '../api';
import { AddButton, Chips, FieldLabel, MaterialLine, Note } from '../components';

/** Filed audits, newest first. Reading only — an audit never changes stock. */
export function AuditTab({ factoryId, onStart }: { factoryId: string; onStart: () => void }) {
  const fetcher = useCallback(() => listAudits(factoryId), [factoryId]);
  const { data, loading, error } = useQuery(fetcher);
  const [selected, setSelected] = useState<string | null>(null);

  const audits = data ?? [];
  const active = audits.find((a) => a.id === selected) ?? audits[0] ?? null;

  return (
    <View style={styles.body}>
      <AddButton label="Start This Week's Audit" onPress={onStart} />

      {loading && !data ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <EmptyState icon="alert-triangle" title="Could not load audits" hint={error.message} /> : null}

      {audits.length ? (
        <View>
          <FieldLabel>History</FieldLabel>
          <Chips
            options={audits.slice(0, 8).map((a, i) => ({
              value: a.id,
              label: i === 0 ? `Latest · ${isoDay(a.date)}` : isoDay(a.date),
            }))}
            selected={active?.id ?? null}
            onSelect={setSelected}
          />
        </View>
      ) : null}

      {active ? (
        <Card title={`Counted ${isoDay(active.date)} · ${active.items_checked} codes`}>
          {active.audit_line_items.length === 0 ? (
            <EmptyState icon="clipboard" title="This audit has no line detail." />
          ) : (
            [...active.audit_line_items]
              .sort((a, b) => a.stock_items.code.localeCompare(b.stock_items.code))
              .map((line) => {
                const meta = TYPE_META[line.stock_items.type];
                const v = line.variance;
                return (
                  <MaterialLine
                    key={line.stock_items.code}
                    code={line.stock_items.code}
                    title={`${meta.label} · ${meta.unitPl}`}
                    sub={`Expected ${fmt(line.expected_qty)} · Counted ${fmt(line.actual_qty)}`}
                    value={`${v > 0 ? '+' : ''}${fmt(v)}`}
                    status={v === 0 ? 'Matches' : v < 0 ? 'Short' : 'Over'}
                    statusTone={v === 0 ? 'good' : 'warn'}
                  />
                );
              })
          )}
        </Card>
      ) : data ? (
        <EmptyState icon="clipboard" title="No audits recorded yet." />
      ) : null}

      <Note text="This records what you counted. It does not change stock — a variance is a finding for the owner, not a correction." />
      <Note
        tone="plain"
        text="One pass covers every type at code level. A code sitting in three supplier lots is one thing to count off the shelf, not three."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.content, gap: spacing.block },
});
