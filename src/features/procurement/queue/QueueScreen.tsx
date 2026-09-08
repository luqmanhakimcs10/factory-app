import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { EmptyState, POCard, TopBar } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { ProcurementStackParamList } from '../../../navigation/ProcurementStack';
import { linesTotal, listProcurementPos, poLines, type ProcurementPo } from '../api';

type Props = NativeStackScreenProps<ProcurementStackParamList, 'Queue'>;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The module's landing screen: what still needs a bill, and what was billed
 * this week.
 *
 * **Two entry paths, one screen.** Procurement is a grant now, so this is
 * reached from the Staff Dashboard and gets a back bar — from there, "home" is
 * the dashboard, not this. A legacy dedicated `procurement` login arrives the
 * same way, holding the one grant its role implies, so in practice the back bar
 * is what shows; the home-header branch stays for any route that mounts this
 * stack as a root. The variant is a route param rather than a second copy of
 * the screen, because everything below the header is identical and a fork here
 * would be two lists to keep in step.
 *
 * "Submitted This Week" is deliberately factory-wide rather than
 * `submitted_by = self`: procurement is a shift, not a private inbox, and
 * hiding a colleague's bill from whoever is covering for them is how the same
 * PO gets bought twice.
 */
export function QueueScreen({ navigation, route }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const cameFromDashboard = route.params?.cameFromDashboard ?? false;

  const fetcher = useCallback(() => listProcurementPos(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const pos = data ?? [];
  const awaiting = pos.filter(
    (po) => po.status === 'awaitingProcurement' && po.source === 'manual',
  );

  const cutoff = Date.now() - WEEK_MS;
  const submitted = pos.filter(
    (po) =>
      po.status !== 'awaitingProcurement' &&
      po.submitted_at !== null &&
      new Date(po.submitted_at).getTime() >= cutoff,
  );

  return (
    <View style={styles.screen}>
      {cameFromDashboard ? (
        <TopBar variant="bar" title="Procurement" onPressBack={navigation.goBack} />
      ) : (
        <TopBar variant="home" onPressNotifications={() => {}} />
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={type.heading}>Awaiting Fulfillment</Text>
          <View style={styles.badge}>
            <Text style={[type.pill, styles.badgeLabel]}>{awaiting.length}</Text>
          </View>
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : error ? (
          <EmptyState
            icon="alert-triangle"
            title="Could not load purchase orders"
            hint={error.message}
          />
        ) : awaiting.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title="Nothing to buy"
            hint="Manual purchase orders raised by the store manager appear here."
          />
        ) : (
          awaiting.map((po) => (
            <AwaitingCard
              key={po.id}
              po={po}
              onPress={() =>
                navigation.navigate('Fulfill', { purchaseOrderId: po.id, readOnly: false })
              }
            />
          ))
        )}

        {submitted.length > 0 ? (
          <>
            <Text style={[type.heading, styles.sectionGap]}>Submitted This Week</Text>
            {submitted.map((po) => (
              <SubmittedRow
                key={po.id}
                po={po}
                onPress={() =>
                  navigation.navigate('Fulfill', { purchaseOrderId: po.id, readOnly: true })
                }
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function AwaitingCard({ po, onPress }: { po: ProcurementPo; onPress: () => void }) {
  const lines = poLines(po);

  return (
    <View>
      <POCard
        poNumber={po.po_number}
        title={`${lines.length} item${lines.length === 1 ? '' : 's'} requested`}
        tag="MANUAL REQUEST"
        date={new Date(po.date).toLocaleDateString()}
        swatches={lines.map((line) => ({ colorId: line.colorId, hex: line.hex }))}
        onPress={onPress}
      />
      <View style={styles.needsBill}>
        <Text style={[type.pill, styles.needsBillLabel]}>Needs Bill</Text>
      </View>
    </View>
  );
}

/**
 * A compact done-row, not a card.
 *
 * This section is a receipt rather than a worklist — the confirmation happens
 * in Store Manager — so it reads as one line each. Tapping still opens the
 * bill, read-only, which is the only way to check what was paid without
 * involving the store manager.
 */
function SubmittedRow({ po, onPress }: { po: ProcurementPo; onPress: () => void }) {
  const total = linesTotal(poLines(po));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${po.po_number}, submitted`}
      onPress={onPress}
      style={({ pressed }) => [styles.doneRow, pressed && styles.pressed]}
    >
      <Feather name="check-circle" size={18} color={colors.success} />
      <View style={styles.doneText}>
        <Text style={type.code}>{po.po_number}</Text>
        <Text style={type.label} numberOfLines={1}>
          {po.actual_supplier?.name ?? 'Supplier not recorded'}
        </Text>
      </View>
      <Text style={[type.code, styles.doneTotal]}>{formatRs(total)}</Text>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  badge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
  },
  badgeLabel: {
    color: colors.warning,
  },
  loader: {
    marginTop: spacing.content * 2,
  },
  // Sits under its card rather than inside it: POCard's header row is the PO
  // number and the source tag, and this is a third status of its own.
  needsBill: {
    alignSelf: 'flex-start',
    marginTop: spacing.hair + 2,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.warningBg,
  },
  needsBillLabel: {
    color: colors.warning,
  },
  sectionGap: {
    marginTop: spacing.tight,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingHorizontal: spacing.content - 2,
    paddingVertical: spacing.tight + 2,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.85,
  },
  doneText: {
    flex: 1,
  },
  doneTotal: {
    fontSize: 15,
    color: colors.textPrimary,
  },
});
