import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { DashCard, EmptyState, GrantChips, NoteCard, TopBar } from '../../components';
import { colors, layout, spacing } from '../../theme';
import { useQuery } from '../../data/useQuery';
import { useSession } from '../../state/session';
import { ROLE_LABELS } from '../../navigation/roleStacks';
import type { StaffStackParamList } from '../../navigation/StaffStack';
import { RESPONSIBILITY_LABELS, type Responsibility } from '../company-admin/rosters';
import { hasDutyOverlap, useGrants } from './grants';
import { loadDashboardCounts, type DashboardCounts } from './api';

type Props = NativeStackScreenProps<StaffStackParamList, 'Dashboard'>;

/**
 * The true root screen for the unified staff persona.
 *
 * Order Taker and Procurement used to be logins of their own, each with a
 * module root of its own. They are capabilities now, and this is the screen
 * they are reached from — which is why both of those modules take a
 * `cameFromDashboard` flag and swap their home header for a back bar when it is
 * set. "Home" for this person is here, not a queue.
 *
 * The grid is permission-gated and nothing else: one card per grant held, no
 * card for a grant not held, no disabled or greyed-out placeholder. A capability
 * an account does not have should not be visible as something withheld — RLS
 * and the RPCs' own `has_grant` checks are the boundary, and this grid agrees
 * with them rather than second-guessing them.
 *
 * A person holding exactly one grant still gets this dashboard rather than
 * dropping straight into their single flow. That was the source spec's open
 * question; keeping the dashboard means the header always names them and the
 * grant chips are always visible, including on a day when the one card reads
 * zero.
 */
export function StaffDashboardScreen({ navigation }: Props) {
  const profile = useSession((state) => state.profile);
  const factoryId = profile?.factory_id;
  const profileId = profile?.id;

  const { data: grantData, loading: grantsLoading, error: grantsError } = useGrants();
  const grants = grantData?.grants ?? [];

  const countsFetcher = useCallback(
    () => loadDashboardCounts(factoryId as string, profileId as string, grants),
    // `grants.join` rather than the array: a new array identity every render
    // would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [factoryId, profileId, grants.join(',')],
  );
  const { data: counts } = useQuery(
    countsFetcher,
    Boolean(factoryId && profileId && grants.length > 0),
  );

  const roleLabel = profile ? ROLE_LABELS[profile.role] : '';
  const subtitle = grantData ? `${roleLabel} · ${grantData.displayName}` : roleLabel;

  return (
    <View style={styles.screen}>
      <TopBar
        variant="home"
        subtitle={subtitle}
        onPressNotifications={() => {}}
        showSignOut={false}
      />

      {grants.length > 0 ? (
        <View style={styles.chipBar}>
          <GrantChips labels={grants.map((grant) => RESPONSIBILITY_LABELS[grant])} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {grantsLoading && !grantData ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : grantsError ? (
          <EmptyState
            icon="alert-triangle"
            title="Could not load your responsibilities"
            hint={grantsError.message}
          />
        ) : grants.length === 0 ? (
          <EmptyState
            icon="lock"
            title="No responsibilities yet"
            hint="The factory owner sets these when adding a delivery person. Ask them to grant the ones you need."
          />
        ) : (
          <>
            {hasDutyOverlap(grants) ? (
              <NoteCard text="This person both requests material and buys it. The store manager still confirms every receipt." />
            ) : null}

            <View style={styles.grid}>
              {grants.map((grant) => (
                <GrantCard
                  key={grant}
                  grant={grant}
                  counts={counts}
                  onPress={() => open(navigation, grant)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Where each grant's card goes. The two retrofitted modules are nested stacks. */
function open(navigation: Props['navigation'], grant: Responsibility): void {
  switch (grant) {
    case 'orderTaking':
      navigation.navigate('OrderTaker', {
        screen: 'OrdersList',
        params: { cameFromDashboard: true },
      });
      return;
    case 'procurePo':
      navigation.navigate('Procurement', {
        screen: 'Queue',
        params: { cameFromDashboard: true },
      });
      return;
    case 'sheetMovement':
      navigation.navigate('MoveHub');
      return;
    case 'orderDelivery':
      navigation.navigate('DeliveryQueue');
      return;
    case 'orderReturn':
      navigation.navigate('ReturnQueue');
      return;
  }
}

interface CardSpec {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  stat: (counts: DashboardCounts) => string;
  urgent?: (counts: DashboardCounts) => boolean;
}

/**
 * Card copy and stat line per grant.
 *
 * The title here is the short screen name, not the long grant label — the chips
 * above already carry the formal wording, and "Delivery & Pickup Sheets from
 * Finishing Partners" does not fit on a half-width tile.
 */
const CARDS: Record<Responsibility, CardSpec> = {
  orderTaking: {
    icon: 'clipboard',
    title: 'Order Taking',
    stat: (c) => `${c.ordersOpen} order${c.ordersOpen === 1 ? '' : 's'} open`,
  },
  sheetMovement: {
    icon: 'repeat',
    title: 'Sheet Movement',
    stat: (c) => `${c.movementsReady} to drop · ${c.movementsOut} out`,
    urgent: (c) => c.movementsOverdue > 0,
  },
  orderDelivery: {
    icon: 'truck',
    title: 'Order Delivery',
    stat: (c) => `${c.toDeliver} to deliver`,
  },
  orderReturn: {
    icon: 'corner-up-left',
    title: 'Order Return',
    stat: (c) => `${c.toReturn} to return`,
    urgent: (c) => c.toReturn > 0,
  },
  procurePo: {
    icon: 'file-text',
    title: 'Procure PO',
    stat: (c) => `${c.posToBuy} PO${c.posToBuy === 1 ? '' : 's'} to buy`,
  },
};

function GrantCard({
  grant,
  counts,
  onPress,
}: {
  grant: Responsibility;
  counts: DashboardCounts | null;
  onPress: () => void;
}) {
  const spec = CARDS[grant];

  return (
    <DashCard
      icon={spec.icon}
      title={spec.title}
      // A dash, not a zero, until the counts land: zero is a fact about the
      // queue and this is the absence of one.
      stat={counts ? spec.stat(counts) : '—'}
      statUrgent={counts ? (spec.urgent?.(counts) ?? false) : false}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  /**
   * Continues the header's white surface, so the chips read as part of it.
   *
   * Pulled up one hairline to sit over the TopBar's own bottom border: the
   * divider belongs under the whole identity block, not between the name and
   * the chips describing it.
   */
  chipBar: {
    marginTop: -layout.hairline,
    paddingHorizontal: 20,
    paddingBottom: spacing.block,
    backgroundColor: colors.surface,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.border,
  },
  content: {
    padding: spacing.content,
    gap: spacing.block,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.block,
  },
  loader: {
    marginTop: spacing.content * 2,
  },
});
