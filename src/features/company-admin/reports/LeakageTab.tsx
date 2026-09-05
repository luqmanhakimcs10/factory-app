import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { Card, EmptyState, FilterChips, dayOf, formatDay } from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { SectionLabel } from '../components';
import type { LeakageAudit } from '../reports';

/** Verbatim, and not to be paraphrased. */
const MIRRORED_CAPTION =
  "Mirrored from the Store Manager's own Weekly Stock Audit — the leakage report is that same variance data read from the owner's side.";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Stock leakage — which is the weekly audit, read from this side.
 *
 * Audits are already newest-first from the query, so "Latest" is the first
 * row and needs no separate lookup. Only one audit is shown at a time: a
 * variance is a fact about one count on one day, and stacking several counts on
 * one screen invites reading a repeated variance as a growing one.
 */
export function LeakageTab({ audits }: { audits: LeakageAudit[] }) {
  const [day, setDay] = useState<string | null>(null);

  const audit = day
    ? (audits.find((entry) => dayOf(entry.date) === day) ?? null)
    : (audits[0] ?? null);

  if (audits.length === 0 || !audit) {
    return (
      <EmptyState
        icon="clipboard"
        title="No stock audits yet"
        hint="This tab reads the Store Manager's Weekly Stock Audit. Nothing has been counted."
      />
    );
  }

  return (
    <View style={styles.tab}>
      <FilterChips
        label="Filter by date"
        values={audits.map((entry) => dayOf(entry.date))}
        value={day}
        onChange={setDay}
        format={formatDay}
        allLabel="Latest"
      />

      <Card style={styles.card}>
        <SectionLabel>
          {`Weekly Stock Audit — ${formatDay(dayOf(audit.date))}`}
        </SectionLabel>

        <View style={styles.summary}>
          <View style={styles.check}>
            <Feather
              name={audit.varianceCount === 0 ? 'check' : 'alert-triangle'}
              size={18}
              color={audit.varianceCount === 0 ? colors.success : colors.warning}
            />
          </View>
          <View style={styles.summaryText}>
            <Text style={type.bodyStrong}>
              {`${audit.itemsMatched} of ${plural(audit.itemsChecked, 'item')} matched`}
            </Text>
            <Text style={type.bodyStrong}>
              {audit.varianceCount === 0
                ? 'No items had a variance'
                : `${plural(audit.varianceCount, 'item')} had a variance`}
            </Text>
          </View>
        </View>
      </Card>

      {/* The breakdown card is absent, not empty, on a clean count — the
          summary line above already says there was nothing to list. */}
      {audit.items.length > 0 ? (
        <Card style={styles.card}>
          <SectionLabel>Items with variance</SectionLabel>
          {audit.items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.item, index < audit.items.length - 1 && styles.divider]}
            >
              <Text style={[type.body, styles.itemLabel]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text
                style={[type.code, item.short ? styles.short : styles.over]}
              >
                {item.variance}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Text style={[type.label, styles.caption]}>{MIRRORED_CAPTION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: {
    gap: spacing.block,
  },
  card: {
    gap: spacing.tight + 2,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
  },
  check: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
    paddingVertical: spacing.tight,
  },
  divider: {
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  itemLabel: {
    flex: 1,
  },
  short: {
    fontSize: 14,
    color: colors.danger,
  },
  over: {
    fontSize: 14,
    color: colors.warning,
  },
  caption: {
    color: colors.textSecondary,
  },
});
