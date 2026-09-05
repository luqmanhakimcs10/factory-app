import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button, EmptyState, TopBar } from '../../components';
import { colors, spacing } from '../../theme';
import {
  FootnoteCaption,
  RosterRow,
  SectionLabel,
  type RosterEntry,
} from './components';

export interface RosterScreenProps {
  title: string;
  /** "+ Add Employee" — the button reads the singular, the section the count. */
  addLabel: string;
  entries: RosterEntry[];
  loading: boolean;
  error: Error | null;
  /** Verbatim explanatory copy under the list, where the spec gives one. */
  footnote?: string;
  emptyHint: string;
  onBack: () => void;
  onAdd: () => void;
  onOpen: (id: string) => void;
}

/**
 * Employees, Finishing Partners, Suppliers and Clients are one screen.
 *
 * All four are the same list: an add button, an ACTIVE section, and an INACTIVE
 * section that is absent rather than empty when nobody has been deactivated.
 * They differ only in what a row's tag and sub-line say, and each list screen
 * decides that when it maps its own rows — which is the part that genuinely
 * differs, because a supplier's terms and an employee's are different facts.
 *
 * Four copies of this file is how one roster ends up sorting inactive rows into
 * the active section, or losing the section header entirely, without any of the
 * other three noticing.
 */
export function RosterScreen({
  title,
  addLabel,
  entries,
  loading,
  error,
  footnote,
  emptyHint,
  onBack,
  onAdd,
  onOpen,
}: RosterScreenProps) {
  const active = entries.filter((entry) => entry.active);
  const inactive = entries.filter((entry) => !entry.active);

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={title} onPressBack={onBack} />

      {loading && entries.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState
          icon="alert-triangle"
          title={`Could not load ${title.toLowerCase()}`}
          hint={error.message}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Button label={addLabel} tone="outline" icon="plus" onPress={onAdd} />

          {entries.length === 0 ? (
            <EmptyState icon="users" title={`No ${title.toLowerCase()} yet`} hint={emptyHint} />
          ) : null}

          {active.length > 0 ? (
            <>
              <SectionLabel>{`Active (${active.length})`}</SectionLabel>
              {active.map((entry) => (
                <RosterRow key={entry.id} entry={entry} onPress={() => onOpen(entry.id)} />
              ))}
            </>
          ) : null}

          {/* Absent, not empty: a factory that has never deactivated anyone
              should not carry a permanent "INACTIVE (0)" heading. */}
          {inactive.length > 0 ? (
            <>
              <SectionLabel>{`Inactive (${inactive.length})`}</SectionLabel>
              {inactive.map((entry) => (
                <RosterRow key={entry.id} entry={entry} onPress={() => onOpen(entry.id)} />
              ))}
            </>
          ) : null}

          {footnote ? <FootnoteCaption>{footnote}</FootnoteCaption> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loader: {
    marginTop: spacing.content * 3,
  },
  content: {
    padding: spacing.content,
    gap: spacing.tight + 2,
  },
});
