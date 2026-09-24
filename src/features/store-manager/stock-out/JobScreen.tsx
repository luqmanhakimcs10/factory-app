import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, InfoRow, NumericKeypadSheet, PhotoTile } from '../../../components';
import { colors, type } from '../../../theme';
import { getSwatch } from '../../../data/swatches';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import { formatGrams } from '../../../lib/quantityFormat';
import {
  bobbinsRequired,
  drawPlan,
  fifoPlan,
  fmt,
  getBobbinRatio,
  getJob,
  getStockBook,
  isoDay,
  issueJob,
  jobLabel,
  onHand,
  resolveJobLines,
  unitsLabel,
  type Job,
  type StockBook,
} from '../api';
import { Chips, DetailShell, ErrorCard, FieldLabel, MaterialLine, Note } from '../components';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'Job'>;

/**
 * A Job is an order Floor Manager sent to the store (`materialRequested`).
 * Issuing it records what was physically handed over, drains FIFO, and makes
 * the same `materialRequested -> readyToCollect` flip Floor Manager's Collect
 * screen waits on — through `issue_job`, the only path that does.
 *
 * Thread requirements arrive in grams and lots count cones, with no factor
 * between them, so the store manager types the cones handed over and the
 * requested grams stay beside it for reference.
 */
export function JobScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id) as string;
  const fetcher = useCallback(
    () => Promise.all([getJob(orderId), getStockBook(factoryId), getBobbinRatio(factoryId)]),
    [orderId, factoryId],
  );
  const { data, loading, error } = useQuery(fetcher);

  if (!data) {
    return <DetailShell title="Job" onBack={navigation.goBack} loading={loading} error={error} />;
  }

  const [job, book, ratio] = data;
  return job.floor_status === 'materialRequested' ? (
    <PendingJob
      job={job}
      book={book}
      ratio={ratio}
      factoryId={factoryId}
      onBack={navigation.goBack}
    />
  ) : (
    <IssuedJob job={job} onBack={navigation.goBack} />
  );
}

function PendingJob({
  job,
  book,
  ratio,
  factoryId,
  onBack,
}: {
  job: Job;
  book: StockBook;
  ratio: number;
  factoryId: string;
  onBack: () => void;
}) {
  const lines = resolveJobLines(job, book);
  const bobbinCodes = book.codes.filter((code) => code.type === 'bobbin');

  const [issued, setIssued] = useState<number[]>(() => lines.map(() => 0));
  const [bobbinId, setBobbinId] = useState<string | null>(
    () => [...bobbinCodes].sort((a, b) => onHand(book, b.id) - onHand(book, a.id))[0]?.id ?? null,
  );
  const [bobbinOverride, setBobbinOverride] = useState<number | null>(null);
  const [keypad, setKeypad] = useState<number | 'bobbin' | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const threadCones = lines.reduce((sum, line, ix) => sum + (line.code ? issued[ix] : 0), 0);
  const bobbinNeed = bobbinsRequired(threadCones, ratio);
  const bobbinIssued = bobbinOverride ?? bobbinNeed;

  const shortLine = lines.some((line, ix) => line.code && fifoPlan(book, line.code.id, issued[ix]).short > 0);
  const bobbinShort = bobbinId !== null && bobbinIssued > onHand(book, bobbinId);
  const nothing = threadCones === 0 && bobbinIssued === 0;
  const blocked = shortLine || bobbinShort || nothing || !photoUri;

  const submit = async () => {
    if (!photoUri) return;
    setSaving(true);
    setFailure(null);
    try {
      await issueJob({
        factoryId,
        orderId: job.id,
        photoUri,
        lines: lines.flatMap((line, ix) =>
          line.code ? [{ stockItemId: line.code.id, requestedGrams: line.requestedGrams, issuedQty: issued[ix] }] : [],
        ),
        bobbin: bobbinId && bobbinIssued > 0 ? { stockItemId: bobbinId, issuedQty: bobbinIssued } : null,
      });
      onBack();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailShell
      title={jobLabel(job)}
      trailing="Requested · Floor Manager"
      onBack={onBack}
      footer={
        <Button label="Issue to Floor" icon="send" flex disabled={blocked} loading={saving} onPress={() => void submit()} />
      }
    >
      <Card>
        <InfoRow
          icon="file-text"
          label={`Order ${job.code}`}
          subLabel={`${job.clients?.name ?? 'Client'} · ${isoDay(job.created_at)}`}
        />
      </Card>

      <Card title="Materials">
        {lines.map((line, ix) => {
          const colour = getSwatch(line.colorId)?.label ?? line.colorId;
          if (!line.code) {
            return (
              <MaterialLine
                key={`${line.colorId}-${ix}`}
                code="?"
                title={`Requested ${formatGrams(line.requestedGrams)} · ${colour}`}
                sub={`No thread code carries the colour "${colour}". Add one before this line can be issued.`}
                status="No code"
                statusTone="warn"
              />
            );
          }
          const { plan, short } = fifoPlan(book, line.code.id, issued[ix]);
          return (
            <MaterialLine
              key={`${line.colorId}-${ix}`}
              code={line.code.code}
              title={`Requested ${formatGrams(line.requestedGrams)} · ${colour}`}
              sub={`On hand ${fmt(onHand(book, line.code.id))} · ${
                plan.length ? plan.map((p) => `${fmt(p.take)} @${p.party.split(' ')[0]}`).join(' + ') : 'nothing to drain'
              }`}
              value={`${fmt(issued[ix])} cones`}
              onPressValue={() => setKeypad(ix)}
              status={short > 0 ? 'Short' : 'In stock'}
              statusTone={short > 0 ? 'warn' : 'good'}
            />
          );
        })}
      </Card>

      {bobbinCodes.length ? (
        <Card title="Bobbin required">
          <FieldLabel>Bobbin code</FieldLabel>
          <Chips
            options={bobbinCodes.map((code) => ({ value: code.id, label: `${code.code} · ${fmt(onHand(book, code.id))}` }))}
            selected={bobbinId}
            onSelect={setBobbinId}
          />
          <MaterialLine
            code={bobbinCodes.find((c) => c.id === bobbinId)?.code ?? '—'}
            title={unitsLabel('bobbin', bobbinIssued)}
            sub={`${Math.round(ratio * 100)}% of thread issued (${fmt(threadCones)} cones) = ${fmt(bobbinNeed)}`}
            value={fmt(bobbinIssued)}
            onPressValue={() => setKeypad('bobbin')}
            status={bobbinShort ? 'Short' : 'In stock'}
            statusTone={bobbinShort ? 'warn' : 'good'}
          />
          <Text style={type.caption}>
            Ratio set by the owner in factory settings and applied to thread — not typed here, and never on the job card.
          </Text>
        </Card>
      ) : null}

      <Card title="Proof photo">
        <PhotoTile
          shape="wide"
          height={160}
          photoUri={photoUri}
          label={photoUri ? 'Photo added' : 'Tap to photograph the issued items'}
          onCapture={setPhotoUri}
        />
      </Card>

      <Note text="Record what you physically hand over. Tap a quantity to change it — stock moves by the issued figure, and the requested amount is kept beside it." />
      {failure ? <ErrorCard title="Could not issue" message={failure} /> : null}

      <NumericKeypadSheet
        visible={keypad !== null}
        title={keypad === 'bobbin' ? 'Bobbins issued' : 'Cones issued'}
        initialValue=""
        placeholder="—"
        maxLength={6}
        minLength={1}
        format={(digits) => fmt(Number(digits))}
        onSubmit={(digits) => {
          const n = Number(digits);
          if (keypad === 'bobbin') setBobbinOverride(n);
          else if (keypad !== null) setIssued(issued.map((v, i) => (i === keypad ? n : v)));
          setKeypad(null);
        }}
        onClose={() => setKeypad(null)}
      />
    </DetailShell>
  );
}

function IssuedJob({ job, onBack }: { job: Job; onBack: () => void }) {
  return (
    <DetailShell
      title={jobLabel(job)}
      trailing={`Issued by ${job.issued_profile?.full_name ?? 'Store Manager'}`}
      onBack={onBack}
    >
      <Card>
        <InfoRow
          icon="file-text"
          label={`Order ${job.code}`}
          subLabel={`${job.clients?.name ?? 'Client'} · issued ${isoDay(job.issued_date)}`}
        />
      </Card>
      <Card title="Materials">
        {job.issue_lines.length === 0 ? (
          <Text style={type.label}>Issued before lot tracking — no line detail recorded.</Text>
        ) : (
          job.issue_lines.map((line) => {
            const plan = drawPlan(line.stock_moves);
            const gap =
              line.required_qty !== null && line.required_qty !== line.issued_qty
                ? line.issued_qty < line.required_qty
                  ? `Issued less than required ${fmt(line.required_qty)} — gap recorded`
                  : `Issued more than required ${fmt(line.required_qty)} — gap recorded`
                : null;
            return (
              <MaterialLine
                key={line.id}
                code={line.stock_items.code}
                title={
                  line.is_bobbin
                    ? `Bobbins · required ${fmt(line.required_qty ?? 0)}`
                    : line.requested_grams !== null
                      ? `Requested ${formatGrams(line.requested_grams)}`
                      : unitsLabel(line.stock_items.type, line.issued_qty)
                }
                sub={plan.length ? plan.map((p) => `${fmt(p.take)} @${p.party}`).join(' + ') : 'Nothing drained'}
                extra={gap ? <Text style={[type.caption, { color: colors.warning }]}>{gap}</Text> : undefined}
                value={fmt(line.issued_qty)}
                status="Issued"
              />
            );
          })
        )}
      </Card>
      <View>
        <Note tone="good" text={`Issued ${isoDay(job.issued_date)}. Stock moved by what was handed over.`} />
      </View>
    </DetailShell>
  );
}
