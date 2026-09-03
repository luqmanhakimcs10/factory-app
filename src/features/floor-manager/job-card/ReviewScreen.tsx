import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, MiniNeedleRow, StaticField } from '../../../components';
import { colors, radius, spacing, type } from '../../../theme';
import { STAGE_DEFS } from '../../../data/stageDefs';
import { useQuery } from '../../../data/useQuery';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import {
  getFloorOrder,
  nextJobCardCode,
  perRepeatStitches,
  stageQueue,
  totalRepeats,
} from '../api';
import { JobCardLayout } from './JobCardLayout';
import { useJobCard } from './jobCardStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'JobCardReview'>;

/** Step 4. Read-only summary, then mint the job-card code. */
export function ReviewScreen({ navigation, route }: Props) {
  const { orderId } = route.params;

  const designCode = useJobCard((state) => state.designCode);
  const jobCardCode = useJobCard((state) => state.jobCardCode);
  const setJobCardCode = useJobCard((state) => state.setJobCardCode);
  const needles = useJobCard((state) => state.needles);
  const stages = useJobCard((state) => state.stages);

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => getFloorOrder(orderId), [orderId]);
  const { data: order } = useQuery(fetcher);

  const repeats = order ? totalRepeats(order) : 0;
  const perRepeat = perRepeatStitches(needles);
  const chips = ['Embroidery', ...stageQueue(stages).map((key) => STAGE_DEFS[key].label)];

  const generate = async () => {
    setWorking(true);
    setError(null);
    try {
      // Reuse the code if the client already saw one and came back for changes.
      const code = jobCardCode ?? (await nextJobCardCode());
      setJobCardCode(code);
      navigation.navigate('JobCardGenerated', { orderId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  return (
    <JobCardLayout
      title="Review"
      step={4}
      trailing={order?.code}
      onBack={navigation.goBack}
      heading="Review the job card"
      subtext="Check the layout before generating it for the client."
      footer={
        <Button
          label="Generate Job Card"
          flex
          loading={working}
          onPress={generate}
        />
      }
    >
      <Card>
        <StaticField icon="hash" label="Design Code" value={designCode ?? '—'} />
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
      </Card>

      <Card title="Needles">
        {needles.map((entry) => (
          <MiniNeedleRow
            key={entry.color_id}
            colorId={entry.color_id}
            needle={entry.needle}
            stitches={entry.stitches}
          />
        ))}
      </Card>

      <Card title="Stages">
        <View style={styles.chips}>
          {chips.map((label) => (
            <View key={label} style={styles.chip}>
              <Text style={[type.pill, styles.chipLabel]}>{label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {error ? (
        <Card tone="danger">
          <Text style={[type.bodyStrong, styles.errorTitle]}>
            Could not generate the job card
          </Text>
          <Text style={type.body}>{error}</Text>
        </Card>
      ) : null}
    </JobCardLayout>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight - 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralAccent,
  },
  chipLabel: {
    color: colors.primary,
  },
  errorTitle: {
    color: colors.danger,
  },
});
