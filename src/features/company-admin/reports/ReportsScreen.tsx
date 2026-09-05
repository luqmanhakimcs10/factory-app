import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, TabRow, TopBar } from '../../../components';
import { colors, spacing } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { getReports } from '../reports';
import { PnlTab } from './PnlTab';
import { PerOrderTab } from './PerOrderTab';
import { LeakageTab } from './LeakageTab';
import { ProductivityTab } from './ProductivityTab';
import { UptimeTab } from './UptimeTab';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'Reports'>;

type TabKey = 'pnl' | 'order' | 'leakage' | 'productivity' | 'uptime';

const TABS = [
  { key: 'pnl', label: 'P&L' },
  { key: 'order', label: 'Per-Order' },
  { key: 'leakage', label: 'Leakage' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'uptime', label: 'Uptime' },
] as const satisfies readonly { key: TabKey; label: string }[];

/**
 * Five reports behind one tab row.
 *
 * The tabs carry no count badges: none of these five is a queue with a number
 * of things waiting in it, and a badge on a report reads as one.
 *
 * Everything is fetched once, on focus, rather than per tab — see `getReports`.
 * Each tab's own filter state lives in that tab's component and is deliberately
 * not lifted here: a month picked on P&L means nothing to Productivity, and
 * shared filter state is how switching tabs silently re-filters the next one.
 */
export function ReportsScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const [tab, setTab] = useState<TabKey>('pnl');

  const fetcher = useCallback(() => getReports(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Reports Hub" onPressBack={navigation.goBack} />

      <TabRow tabs={TABS} activeKey={tab} onChange={setTab} showScrollHint />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error || !data ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load reports"
          hint={error?.message}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'pnl' ? (
            <PnlTab current={data.pnl.current} closed={data.pnl.closed} />
          ) : null}
          {tab === 'order' ? <PerOrderTab orders={data.orders} /> : null}
          {tab === 'leakage' ? <LeakageTab audits={data.audits} /> : null}
          {tab === 'productivity' ? <ProductivityTab workers={data.workers} /> : null}
          {tab === 'uptime' ? <UptimeTab machines={data.machines} /> : null}
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
  },
});
