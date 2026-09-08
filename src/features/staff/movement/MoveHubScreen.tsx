import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  CodeChip,
  EmptyState,
  SlaStrip,
  TabRow,
  TopBar,
  type TabDef,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StaffStackParamList } from '../../../navigation/StaffStack';
import {
  listMovements,
  movementHoursLeft,
  movementSubtitle,
  movementTitle,
  type Movement,
  type MovementStatus,
} from '../api';

type Props = NativeStackScreenProps<StaffStackParamList, 'MoveHub'>;

/**
 * Where every sheet currently is, relative to a finishing partner.
 *
 * This is the finishing-partner handoff tracking the Company Admin spec listed
 * as not built: the partner roster knew who the partners were and what they
 * charged, but nothing recorded that forty repeats had physically left the
 * building on Tuesday and not come back. The three tabs are the three states a
 * movement can be in, so the tab a card sits under is its status, not a filter
 * over one list.
 */
export function MoveHubScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const [tab, setTab] = useState<MovementStatus>('ready');

  const fetcher = useCallback(() => listMovements(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const movements = data ?? [];
  const shown = movements.filter((movement) => movement.status === tab);

  const tabs: TabDef<MovementStatus>[] = [
    {
      key: 'ready',
      label: 'Drop-off',
      count: movements.filter((m) => m.status === 'ready').length,
    },
    {
      key: 'atPartner',
      label: 'At Partner',
      count: movements.filter((m) => m.status === 'atPartner').length,
    },
    // No badge: this tab is a record of what already happened, and a count on
    // it would read as work outstanding.
    { key: 'returned', label: 'Collected' },
  ];

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Sheets Movement" onPressBack={navigation.goBack} />
      <TabRow tabs={tabs} activeKey={tab} onChange={setTab} />

      <ScrollView contentContainerStyle={styles.content}>
        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : error ? (
          <EmptyState
            icon="alert-triangle"
            title="Could not load movements"
            hint={error.message}
          />
        ) : shown.length === 0 ? (
          <EmptyState icon={EMPTY[tab].icon} title={EMPTY[tab].title} hint={EMPTY[tab].hint} />
        ) : (
          shown.map((movement) => (
            <MovementCard
              key={movement.id}
              movement={movement}
              onPress={() =>
                movement.status === 'ready'
                  ? navigation.navigate('DropOff', { movementId: movement.id })
                  : navigation.navigate('PickUp', { movementId: movement.id })
              }
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const EMPTY: Record<
  MovementStatus,
  { icon: 'check-circle' | 'send' | 'archive'; title: string; hint: string }
> = {
  ready: {
    icon: 'check-circle',
    title: 'Nothing to drop off',
    hint: 'Sheets queued for a finishing partner appear here.',
  },
  atPartner: {
    icon: 'send',
    title: 'Nothing out with a partner',
    hint: 'Sheets you drop off show here until you collect them.',
  },
  returned: {
    icon: 'archive',
    title: 'Nothing collected yet',
    hint: 'Completed movements stay here as a record.',
  },
};

/**
 * One movement, in whichever of its three shapes applies.
 *
 * The partner takes the client line and the order takes the sub-line, which
 * inverts every other card in the app on purpose: for the person carrying the
 * sheets the question is which shop to walk into, and the order is what they
 * are carrying once they get there.
 */
function MovementCard({ movement, onPress }: { movement: Movement; onPress: () => void }) {
  const damaged = movement.damaged_count;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHead}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {movementTitle(movement)}
        </Text>
        <Text style={type.code} numberOfLines={1}>
          {movementSubtitle(movement)}
        </Text>
      </View>

      <View style={styles.codes}>
        {movement.codes.map((code) => (
          <CodeChip key={code} code={code} />
        ))}
      </View>

      {movement.status === 'atPartner' ? (
        <SlaStrip hoursLeft={movementHoursLeft(movement)} />
      ) : null}

      {movement.status === 'returned' ? (
        <View style={styles.summary}>
          <Text
            style={[type.label, damaged > 0 ? styles.damaged : styles.allClear]}
            numberOfLines={1}
          >
            {damaged > 0 ? `${damaged} damaged` : 'all clear'}
          </Text>
          <Text style={type.caption} numberOfLines={1}>
            {movement.returned_at
              ? `Returned ${new Date(movement.returned_at).toLocaleDateString()}`
              : ''}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.content,
    gap: spacing.block,
  },
  loader: {
    marginTop: spacing.content * 2,
  },
  card: {
    padding: spacing.content - 2,
    gap: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  cardHead: {
    gap: 2,
  },
  codes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight - 2,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
  },
  damaged: {
    color: colors.danger,
  },
  allClear: {
    color: colors.success,
  },
});
