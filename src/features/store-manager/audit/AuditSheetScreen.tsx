import { useCallback, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, NumericKeypadSheet } from '../../../components';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import { STOCK_TYPES, TYPE_META, fmt, getStockBook, isoDay, onHand, submitAudit } from '../api';
import { DetailShell, ErrorCard, MaterialLine, Note } from '../components';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'AuditSheet'>;

/**
 * One pass over every code of every type. Expected is shown for guidance; the
 * server re-reads it from the lots at submit time. Submitting files a finding
 * and changes no stock.
 */
export function AuditSheetScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id) as string;
  const fetcher = useCallback(() => getStockBook(factoryId), [factoryId]);
  const { data: book, loading, error } = useQuery(fetcher);

  const [counted, setCounted] = useState<Record<string, number>>({});
  const [keypad, setKeypad] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!book) {
    return <DetailShell title="Audit Sheet" onBack={navigation.goBack} loading={loading} error={error} />;
  }

  const codes = [...book.codes].sort(
    (a, b) => STOCK_TYPES.indexOf(a.type) - STOCK_TYPES.indexOf(b.type) || a.code.localeCompare(b.code),
  );
  const left = codes.filter((code) => counted[code.id] === undefined).length;

  const submit = async () => {
    setSaving(true);
    setFailure(null);
    try {
      await submitAudit(codes.map((code) => ({ stockItemId: code.id, counted: counted[code.id] })));
      navigation.goBack();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const target = codes.find((code) => code.id === keypad);

  return (
    <DetailShell
      title="Audit Sheet"
      trailing={isoDay(new Date().toISOString())}
      onBack={navigation.goBack}
      footer={
        <>
          <Button label="Cancel" tone="secondary" flex onPress={navigation.goBack} />
          <Button label="Submit Audit" flex disabled={left > 0} loading={saving} onPress={() => void submit()} />
        </>
      }
    >
      <Note tone="plain" text="Walk the store once and count everything. Tap each line to enter what you actually counted." />
      <Card>
        {codes.map((code) => {
          const expected = onHand(book, code.id);
          const c = counted[code.id];
          const v = c === undefined ? null : c - expected;
          return (
            <MaterialLine
              key={code.id}
              code={code.code}
              title={TYPE_META[code.type].label}
              sub={`Expected ${fmt(expected)} ${TYPE_META[code.type].unitPl}`}
              value={c === undefined ? 'Count' : fmt(c)}
              onPressValue={() => setKeypad(code.id)}
              status={v === null ? undefined : v === 0 ? 'Matches' : `${v > 0 ? '+' : ''}${fmt(v)}`}
              statusTone={v === 0 ? 'good' : 'warn'}
            />
          );
        })}
      </Card>
      {left ? (
        <Note text={`${left} line${left === 1 ? '' : 's'} still to count.`} />
      ) : (
        <Note tone="good" text="All lines counted. Submit to file this week's audit." />
      )}
      {failure ? <ErrorCard title="Could not submit the audit" message={failure} /> : null}

      <NumericKeypadSheet
        visible={keypad !== null}
        title={target ? `Counted — code ${target.code}` : 'Counted quantity'}
        initialValue=""
        placeholder="—"
        maxLength={7}
        minLength={1}
        format={(digits) => fmt(Number(digits))}
        unitSuffix={target ? ` ${TYPE_META[target.type].unitPl}` : undefined}
        onSubmit={(digits) => {
          if (keypad) setCounted({ ...counted, [keypad]: Number(digits) });
          setKeypad(null);
        }}
        onClose={() => setKeypad(null)}
      />
    </DetailShell>
  );
}
