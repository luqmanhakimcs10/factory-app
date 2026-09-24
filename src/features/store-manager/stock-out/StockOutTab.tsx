import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState } from '../../../components';
import { colors, spacing, type } from '../../../theme';
import {
  drawPlan,
  fmt,
  isoDay,
  jobLabel,
  lotIdentity,
  unitsLabel,
  type Job,
  type Sale,
} from '../api';
import { AddButton, Chips, CodeChipText, ListRow, Mono, Note, Pill } from '../components';

export type StockOutSub = 'sales' | 'issuance';

export function StockOutTab({
  sub,
  onSub,
  sales,
  jobs,
  loading,
  onNewSale,
  onOpenSale,
  onOpenJob,
}: {
  sub: StockOutSub;
  onSub: (next: StockOutSub) => void;
  sales: Sale[] | null;
  jobs: { pending: Job[]; issued: Job[] } | null;
  loading: boolean;
  onNewSale: () => void;
  onOpenSale: (id: string) => void;
  onOpenJob: (orderId: string) => void;
}) {
  return (
    <View style={styles.body}>
      <Chips
        options={[
          { value: 'sales', label: 'Sales' },
          { value: 'issuance', label: 'Issuance' },
        ]}
        selected={sub}
        onSelect={onSub}
      />
      {loading && !(sales && jobs) ? <ActivityIndicator color={colors.primary} /> : null}
      {sub === 'sales' ? <SalesList sales={sales} onNew={onNewSale} onOpen={onOpenSale} /> : null}
      {sub === 'issuance' && jobs ? <Issuance jobs={jobs} onOpen={onOpenJob} /> : null}
    </View>
  );
}

function SalesList({
  sales,
  onNew,
  onOpen,
}: {
  sales: Sale[] | null;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const list = sales ?? [];
  const units = list.reduce((sum, s) => sum + s.qty, 0);
  const value = list.reduce((sum, s) => sum + s.value, 0);
  const unpaid = list.filter((s) => !s.paid).reduce((sum, s) => sum + s.value, 0);

  return (
    <>
      <AddButton label="Record a Sale" onPress={onNew} />
      <Note
        tone="plain"
        text="A sale sends stock out of the factory to an outside buyer. Issuance moves it to your own floor — the two never mix."
      />
      {sales && list.length === 0 ? <EmptyState icon="shopping-bag" title="No sales recorded yet." /> : null}
      {list.length ? (
        <Card>
          {list.map((s) => (
            <ListRow
              key={s.id}
              onPress={() => onOpen(s.id)}
              right={<Pill label={s.paid ? 'Paid' : 'Unpaid'} tone={s.paid ? 'good' : 'danger'} />}
            >
              <Text style={type.bodyStrong}>{s.customer_name}</Text>
              <CodeChipText>
                {lotIdentity(s.stock_items.code, drawPlan(s.stock_moves).map((p) => p.party))}
              </CodeChipText>
              <Mono strong>{`${unitsLabel(s.stock_items.type, s.qty)} · Rs. ${fmt(s.value)}`}</Mono>
              <Text style={type.caption}>{`${s.code} · ${isoDay(s.sold_at)}`}</Text>
            </ListRow>
          ))}
        </Card>
      ) : null}
      {list.length ? (
        <Note
          text={`${fmt(units)} units sold · Rs. ${fmt(value)}${unpaid ? ` · Rs. ${fmt(unpaid)} still unpaid` : ''}`}
        />
      ) : null}
    </>
  );
}

function Issuance({ jobs, onOpen }: { jobs: { pending: Job[]; issued: Job[] }; onOpen: (id: string) => void }) {
  return (
    <>
      <Text style={type.heading}>{`Ready to Issue (${jobs.pending.length})`}</Text>
      {jobs.pending.length ? (
        <Card>
          {jobs.pending.map((job) => (
            <ListRow key={job.id} onPress={() => onOpen(job.id)} right={<Pill label="Pending" tone="warn" />}>
              <Text style={type.bodyStrong}>{`${jobLabel(job)} · ${job.clients?.name ?? 'Order'}`}</Text>
              <Text style={type.caption}>{`Order ${job.code} · ${isoDay(job.created_at)}`}</Text>
              <Mono strong>{`${(job.materials ?? []).length} materials`}</Mono>
            </ListRow>
          ))}
        </Card>
      ) : (
        <EmptyState icon="inbox" title="Nothing waiting to be issued." />
      )}

      <Text style={type.heading}>{`Issued (${jobs.issued.length})`}</Text>
      {jobs.issued.length ? (
        <Card>
          {jobs.issued.map((job) => {
            const units = job.issue_lines.reduce((sum, line) => sum + line.issued_qty, 0);
            const identity = job.issue_lines
              .filter((line) => line.issued_qty > 0)
              .map((line) => lotIdentity(line.stock_items.code, drawPlan(line.stock_moves).map((p) => p.party)))
              .join(' / ');
            return (
              <ListRow key={job.id} onPress={() => onOpen(job.id)} right={<Pill label="Issued" tone="good" />}>
                <Text style={type.bodyStrong}>{`${jobLabel(job)} · ${job.clients?.name ?? 'Order'}`}</Text>
                {identity ? <CodeChipText>{identity}</CodeChipText> : null}
                <Mono strong>{`${fmt(units)} units issued`}</Mono>
                <Text style={type.caption}>{isoDay(job.issued_date)}</Text>
              </ListRow>
            );
          })}
        </Card>
      ) : null}

      <Note
        tone="plain"
        text="Issuance is an internal transfer to your own floor. Stock moves by what you physically handed over, never by what the job required."
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.content, gap: spacing.block },
});
