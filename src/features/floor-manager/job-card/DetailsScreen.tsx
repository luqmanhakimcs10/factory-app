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

/** Step 2. Needle layout and the stitch totals that fall out of it. */
export function DetailsScreen({ navigation, route }: Props) {
  const { orderId } = route.params;

  const designCode = useJobCard((state) => state.designCode);
  const setDesignCode = useJobCard((state) => state.setDesignCode);
  const needles = useJobCard((state) => state.needles);
  const seedNeedles = useJobCard((state) => state.seedNeedles);
  const setNeedle = useJobCard((state) => state.setNeedle);

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
              onChangeNeedle={(needle) => setNeedle(entry.color_id, { needle })}
              onEditStitches={() => setEditingColorId(entry.color_id)}
            />
          ))
        )}
      </Card>

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

const styles = StyleSheet.create({
  totals: {
    gap: spacing.tight,
  },
});
