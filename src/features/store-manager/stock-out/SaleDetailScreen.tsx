import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, InfoRow } from '../../../components';
import { colors, fonts, layout, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import { drawPlan, fmt, getSale, isoDay, lotIdentity, markSalePaid, unitsLabel } from '../api';
import { CodeBadge, DetailShell, ErrorCard, Note, Pill, TotalCard } from '../components';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'SaleDetail'>;

export function SaleDetailScreen({ navigation, route }: Props) {
  const { saleId } = route.params;
  const fetcher = useCallback(() => getSale(saleId), [saleId]);
  const { data: sale, loading, error, refetch } = useQuery(fetcher);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!sale) {
    return <DetailShell title="Sale" onBack={navigation.goBack} loading={loading} error={error} />;
  }

  const plan = drawPlan(sale.stock_moves);
  const code = sale.stock_items.code;

  const markPaid = async () => {
    setSaving(true);
    setFailure(null);
    try {
      await markSalePaid(sale.id);
      refetch();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailShell
      title={`Sale ${sale.code}`}
      trailing={sale.customer_name}
      onBack={navigation.goBack}
      footer={
        sale.paid ? undefined : (
          <Button label="Mark Paid" icon="check" flex loading={saving} onPress={() => void markPaid()} />
        )
      }
    >
      <View style={styles.summary}>
        <CodeBadge code={code} />
        <View style={styles.flex}>
          <Text style={type.caption}>{`LOT${plan.length > 1 ? 'S' : ''} DRAINED`}</Text>
          <Text style={styles.identity}>{lotIdentity(code, plan.map((p) => p.party))}</Text>
        </View>
        <Pill label={sale.paid ? 'Paid' : 'Unpaid'} tone={sale.paid ? 'good' : 'danger'} />
      </View>

      <Card>
        <InfoRow
          icon="arrow-right"
          label={unitsLabel(sale.stock_items.type, sale.qty)}
          subLabel={plan.map((p) => `${fmt(p.take)} from ${p.party}`).join(' · ')}
          divider
        />
        <InfoRow icon="user" label={sale.customer_name} subLabel={`External buyer · ${sale.code}`} divider />
        <InfoRow icon="calendar" label={isoDay(sale.sold_at)} subLabel="Recorded by Store Manager" />
      </Card>

      <TotalCard label="Sale value" value={`Rs. ${fmt(sale.value)}`} />
      <Note
        tone="good"
        text={`Stock left the factory and the lot balance dropped by ${fmt(sale.qty)}. The receivable sits with the Accountant.`}
      />
      {failure ? <ErrorCard title="Could not mark paid" message={failure} /> : null}
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 4,
    padding: spacing.content,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  identity: { fontFamily: fonts.mono.semibold, fontSize: 13, color: colors.textPrimary },
});
