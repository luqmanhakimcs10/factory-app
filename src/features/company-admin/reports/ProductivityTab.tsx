import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, FilterChips } from '../../../components';
import { colors, spacing, type } from '../../../theme';
import { formatRs } from '../../../lib/ledgerMath';
import { ILLUSTRATIVE_NOTE } from '../illustrative';
import { reportStyles } from '../components';
import type { WorkerProductivity } from '../reports';

/**
 * Output per machine worker, and whether they were docked this period.
 *
 * The damage line is strictly either/or: a worker with a deduction gets the red
 * caption, a worker without gets the grey one, and never both. The source
 * mockup shows both lines on one card — that is a bug in the mockup, not a
 * layout to copy, and the ternary below is the whole of the fix.
 */
export function ProductivityTab({ workers }: { workers: WorkerProductivity[] }) {
  const [name, setName] = useState<string | null>(null);

  if (workers.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="No machine workers on the roster"
        hint="Add an employee with the Machine Worker role and their output appears here."
      />
    );
  }

  const shown = name ? workers.filter((worker) => worker.name === name) : workers;

  return (
    <View style={styles.tab}>
      <FilterChips
        label="Filter by name"
        values={workers.map((worker) => worker.name)}
        value={name}
        onChange={setName}
        allLabel="All"
      />

      {shown.map((worker) => (
        <Card key={worker.id} style={styles.card}>
          <Text style={type.bodyStrong} numberOfLines={1}>
            {worker.name}
          </Text>

          <View style={styles.split}>
            <View style={styles.half}>
              <Text style={[type.caption, styles.columnLabel]}>AVG. STITCHES / DAY</Text>
              <Text style={reportStyles.figure}>
                {`${worker.avgStitchesPerDay.toLocaleString()} stitches`}
              </Text>
            </View>
            <View style={[styles.half, styles.right]}>
              <Text style={[type.caption, styles.columnLabel, styles.rightText]}>
                EFFICIENCY
              </Text>
              <Text style={[reportStyles.figure, styles.efficiency, styles.rightText]}>
                {`${worker.efficiencyPct}%`}
              </Text>
            </View>
          </View>

          {worker.damage ? (
            <Text style={[type.label, styles.damage]}>
              {`${formatRs(worker.damage.amount)} damage deduction${
                worker.damage.stageLabel ? ` · ${worker.damage.stageLabel}` : ''
              } this period`}
            </Text>
          ) : (
            <Text style={[type.label, styles.noDamage]}>No damage this period</Text>
          )}
        </Card>
      ))}

      <Text style={[type.label, styles.caption]}>{ILLUSTRATIVE_NOTE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: {
    gap: spacing.tight + 2,
  },
  card: {
    gap: spacing.tight + 2,
  },
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.tight,
  },
  half: {
    flex: 1,
    gap: 2,
  },
  right: {
    alignItems: 'flex-end',
  },
  rightText: {
    textAlign: 'right',
  },
  columnLabel: {
    letterSpacing: 0.5,
  },
  efficiency: {
    color: colors.success,
  },
  damage: {
    color: colors.danger,
  },
  noDamage: {
    color: colors.textMuted,
  },
  caption: {
    color: colors.textSecondary,
    marginTop: spacing.tight,
  },
});
