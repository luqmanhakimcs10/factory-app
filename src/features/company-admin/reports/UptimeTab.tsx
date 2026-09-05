import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState } from '../../../components';
import { colors, spacing, type } from '../../../theme';
import { ILLUSTRATIVE_NOTE } from '../illustrative';
import { RosterPill, SectionLabel, reportStyles } from '../components';
import type { MachineUptimeReport } from '../reports';

/** "8.5 hrs", "2 hrs" — a whole number of hours does not read as "2.0". */
function hours(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hrs`;
}

export function UptimeTab({ machines }: { machines: MachineUptimeReport[] }) {
  if (machines.length === 0) {
    return (
      <EmptyState
        icon="cpu"
        title="No machines registered"
        hint="The roster here is the Floor Manager's own — machines appear once that module has them."
      />
    );
  }

  return (
    <View style={styles.tab}>
      <SectionLabel>Machines</SectionLabel>

      {machines.map((machine) => (
        <Card key={machine.id} style={styles.card}>
          <View style={styles.header}>
            <Text style={[type.bodyStrong, styles.label]} numberOfLines={1}>
              {machine.label}
            </Text>
            <RosterPill
              label={machine.running ? 'Running' : 'Idle'}
              tone={machine.running ? 'active' : 'neutral'}
            />
          </View>

          <Text style={type.label} numberOfLines={1}>
            {machine.jobLine}
          </Text>

          <View style={styles.split}>
            <View style={styles.half}>
              <Text style={[type.caption, styles.columnLabel]}>UPTIME THIS WEEK</Text>
              <Text style={[reportStyles.figure, styles.uptime]}>
                {`${machine.uptimePct}%`}
              </Text>
            </View>
            <View style={[styles.half, styles.right]}>
              <Text style={[type.caption, styles.columnLabel, styles.rightText]}>
                DOWNTIME
              </Text>
              <Text style={[reportStyles.figure, styles.downtime, styles.rightText]}>
                {hours(machine.downtimeHours)}
              </Text>
            </View>
          </View>

          <Text style={[type.label, styles.note]}>{machine.note}</Text>
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
    gap: spacing.tight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  label: {
    flex: 1,
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
  uptime: {
    color: colors.success,
  },
  downtime: {
    color: colors.danger,
  },
  note: {
    color: colors.textMuted,
  },
  caption: {
    color: colors.textSecondary,
    marginTop: spacing.tight,
  },
});
