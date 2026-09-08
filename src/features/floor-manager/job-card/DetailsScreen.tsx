import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  EmptyState,
  NeedleRow,
  NoteCard,
  NumericKeypadSheet,
  StaticField,
} from '../../../components';
import type { NeedleEntry } from '../../../data/types';
import {
  applyToNeedles,
  checkStitchTotal,
  colorLabel,
  type DesignSheetExtraction,
} from '../designSheet';
import { colors, spacing } from '../../../theme';
import { getSwatch } from '../../../data/swatches';
import { useQuery } from '../../../data/useQuery';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import {
  getFloorOrder,
  nextDesignCode,
  perRepeatStitches,
  seedThreads,
  totalRepeats,
} from '../api';
import { JobCardLayout } from './JobCardLayout';
import { useJobCard } from './jobCardStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'JobCardDetails'>;

/**
 * Step 2. Needle layout and the stitch totals that fall out of it.
 *
 * When step 1 read a design sheet, the stitch counts arrive here already filled
 * in and flagged amber: read from the photo, not yet checked against the paper.
 * Tapping one accepts it, long-pressing corrects it, and either way it stops
 * being flagged. Nothing blocks on the flags — a floor manager who trusts a
 * clean printout can walk straight past them — but they are visible on the
 * Review screen too, so an unchecked number cannot reach a job card unnoticed.
 */
export function DetailsScreen({ navigation, route }: Props) {
  const { orderId } = route.params;

  const designCode = useJobCard((state) => state.designCode);
  const setDesignCode = useJobCard((state) => state.setDesignCode);
  const needles = useJobCard((state) => state.needles);
  const seedNeedles = useJobCard((state) => state.seedNeedles);
  const setNeedle = useJobCard((state) => state.setNeedle);
  const extraction = useJobCard((state) => state.extraction);
  const unconfirmedColorIds = useJobCard((state) => state.unconfirmedColorIds);
  const confirmColor = useJobCard((state) => state.confirmColor);
  const confirmAll = useJobCard((state) => state.confirmAll);

  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const fetcher = useCallback(() => getFloorOrder(orderId), [orderId]);
  const { data: order, loading } = useQuery(fetcher);

  // Seed the needle rows the first time this order's threads are known. The
  // store ignores a second seed, so re-entering after Changes Requested keeps
  // whatever was edited.
  useEffect(() => {
    if (order) seedNeedles(seedThreads(order));
  }, [order, seedNeedles]);

  // The design code is minted on first arrival here, not at approval — the
  // floor manager reads it off this screen while talking to the client.
  useEffect(() => {
    if (designCode || !order) return;

    let cancelled = false;
    if (order.design_code) {
      setDesignCode(order.design_code);
      return;
    }

    nextDesignCode()
      .then((code) => {
        if (!cancelled) setDesignCode(code);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCodeError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [designCode, order, setDesignCode]);

  const repeats = order ? totalRepeats(order) : 0;
  const perRepeat = perRepeatStitches(needles);
  const editing = needles.find((entry) => entry.color_id === editingColorId);

  return (
    <JobCardLayout
      title="Job Card Details"
      step={2}
      trailing={order?.code}
      onBack={navigation.goBack}
      heading="Needle layout"
      subtext="Set the needle and stitch count for each colour."
      footer={
        <>
          <Button label="Back" tone="secondary" flex onPress={navigation.goBack} />
          <Button
            label="Next"
            flex
            onPress={() => navigation.navigate('JobCardStages', { orderId })}
          />
        </>
      }
    >
      {order?.excluded_note ? (
        <NoteCard title="Excluded from this order" text={order.excluded_note} />
      ) : null}

      <StaticField
        icon="hash"
        label="Design Code"
        value={designCode ?? (codeError ? 'Could not generate' : 'Generating…')}
      />

      <Card title="Needles">
        {loading && !order ? (
          <ActivityIndicator color={colors.primary} />
        ) : needles.length === 0 ? (
          <EmptyState
            icon="alert-triangle"
            title="No colours to configure"
            hint="No sheet on this order has a passed repeat yet."
          />
        ) : (
          needles.map((entry) => (
            <NeedleRow
              key={entry.color_id}
              colorId={entry.color_id}
              needle={entry.needle}
              stitches={entry.stitches}
              unconfirmed={unconfirmedColorIds.includes(entry.color_id)}
              onConfirm={() => confirmColor(entry.color_id)}
              onChangeNeedle={(needle) => setNeedle(entry.color_id, { needle })}
              onEditStitches={() => setEditingColorId(entry.color_id)}
            />
          ))
        )}

        {unconfirmedColorIds.length > 0 ? (
          <Button
            label={`Confirm all ${unconfirmedColorIds.length} read from the sheet`}
            icon="check"
            tone="outline"
            onPress={confirmAll}
          />
        ) : null}
      </Card>

      {extraction ? (
        <ExtractionNotes extraction={extraction} needles={needles} />
      ) : null}

      <View style={styles.totals}>
        <StaticField
          icon="repeat"
          label="Per-Repeat Stitches"
          value={perRepeat.toLocaleString()}
        />
        <StaticField
          icon="layers"
          label="Total Stitches"
          value={(perRepeat * repeats).toLocaleString()}
        />
      </View>

      <NumericKeypadSheet
        visible={editing !== undefined}
        title={`Stitches — ${getSwatch(editing?.color_id ?? '')?.label ?? 'colour'}`}
        initialValue={editing ? String(editing.stitches) : ''}
        placeholder="Enter stitch count"
        maxLength={7}
        minLength={1}
        format={(digits) => Number(digits).toLocaleString()}
        onSubmit={(digits) => {
          if (editingColorId) setNeedle(editingColorId, { stitches: Number(digits) });
          setEditingColorId(null);
        }}
        onClose={() => setEditingColorId(null)}
      />
    </JobCardLayout>
  );
}

/**
 * What the sheet said that these rows could not absorb.
 *
 * Three separate discrepancies, and they mean different things, so they are not
 * collapsed into one warning:
 *
 * - A colour on the sheet that no sheet on this order uses. Usually the client
 *   handed over the sheet for a different order, and it is the only sign of that
 *   before thread gets requested for a colour nobody is stitching.
 * - A colour on the order the sheet never mentioned. Its stitch count is still
 *   whatever it was, so this says "you still have to type this one".
 * - Per-colour counts that do not add up to the sheet's own total. The single
 *   best signal that one digit was misread, because the wrong number looks
 *   entirely plausible on its own line.
 *
 * None of them block. The sheet is the client's paperwork, not the factory's
 * record, and a floor manager who can see why it disagrees is better served
 * than one who is stopped by it.
 */
function ExtractionNotes({
  extraction,
  needles,
}: {
  extraction: DesignSheetExtraction;
  needles: NeedleEntry[];
}) {
  const { unmatched, missing } = applyToNeedles(needles, extraction);
  const check = checkStitchTotal(extraction);

  if (unmatched.length === 0 && missing.length === 0 && !check.mismatch) return null;

  return (
    <Card title="Sheet did not match">
      {check.mismatch ? (
        <NoteCard
          title="Stitch total does not add up"
          text={`The colours on the sheet add up to ${check.sum.toLocaleString()}, but the sheet's own total says ${check.total?.toLocaleString()}. One of the counts was probably misread — check them against the paper.`}
        />
      ) : null}

      {unmatched.length > 0 ? (
        <NoteCard
          title="On the sheet, not on this order"
          text={`${unmatched
            .map(colorLabel)
            .join(', ')} — no sheet on this order uses ${unmatched.length === 1 ? 'it' : 'them'}. Check the client handed over the right design sheet.`}
        />
      ) : null}

      {missing.length > 0 ? (
        <NoteCard
          title="Not on the sheet"
          text={`${missing
            .map((colorId) => getSwatch(colorId)?.label ?? colorId)
            .join(', ')} — the sheet gave no stitch count, so ${missing.length === 1 ? 'this one still needs' : 'these still need'} typing in.`}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  totals: {
    gap: spacing.tight,
  },
});
