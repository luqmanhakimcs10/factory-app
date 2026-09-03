import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card, EmptyState, InfoRow, TabRow, TopBar } from '../../../components';
import { colors, spacing } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { listApprovals, type ApprovalItem } from '../api';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'Approvals'>;

type TabKey = 'pending' | 'decided';

/** Expenses and loans share a queue, so they share an icon vocabulary too. */
const KIND_ICON = {
  expense: 'dollar-sign',
  loan: 'credit-card',
} as const;

/**
 * The approvals inbox.
 *
 * Two tabs rather than two screens: the decided list exists so a rejection can
 * be read back with its reason, which is the only record anyone has of why a
 * submitter's expense came back. Splitting that onto its own screen would hide
 * it behind a navigation nobody would go looking for.
 */
export function ApprovalsScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const [tab, setTab] = useState<TabKey>('pending');

  const fetcher = useCallback(
    () => listApprovals(factoryId as string),
    [factoryId],
  );
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const all = data ?? [];
  const pending = all.filter((item) => item.status === 'pending');
  const decided = all.filter((item) => item.status !== 'pending');
  const shown = tab === 'pending' ? pending : decided;

  const open = (item: ApprovalItem) =>
    navigation.navigate('ApprovalDetail', { kind: item.kind, id: item.id });

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title="Approvals"
        onPressBack={navigation.goBack}
        trailing={pending.length > 0 ? `${pending.length} pending` : undefined}
      />

      <TabRow
        tabs={[
          { key: 'pending', label: 'Pending', count: pending.length },
          { key: 'decided', label: 'Decided', count: decided.length },
        ]}
        activeKey={tab}
        onChange={setTab}
      />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load approvals"
          hint={error.message}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={tab === 'pending' ? 'check-circle' : 'inbox'}
          title={tab === 'pending' ? 'Nothing waiting' : 'Nothing decided yet'}
          hint={
            tab === 'pending'
              ? 'Expenses and loans raised by the accountant land here.'
              : 'Approved and rejected records stay here for the record.'
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            {shown.map((item, index) => (
              <InfoRow
                key={`${item.kind}-${item.id}`}
                icon={KIND_ICON[item.kind]}
                label={item.title}
                subLabel={
                  item.status === 'pending'
                    ? item.subtitle
                    : `${item.subtitle} — ${item.status === 'approved' ? 'approved' : 'rejected'}`
                }
                tone={
                  item.status === 'approved'
                    ? 'success'
                    : item.status === 'rejected'
                      ? 'danger'
                      : 'warning'
                }
                trailing={formatRs(item.amount)}
                divider={index < shown.length - 1}
                onPress={() => open(item)}
              />
            ))}
          </Card>
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
    gap: spacing.block,
  },
});
