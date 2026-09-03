import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, ShareRow, StaticField } from '../../../components';
import { colors, spacing, type } from '../../../theme';
import { STAGE_DEFS } from '../../../data/stageDefs';
import { useQuery } from '../../../data/useQuery';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import {
  approveJobCard,
  computeMaterials,
  getFloorOrder,
  perRepeatStitches,
  stageQueue,
  totalRepeats,
} from '../api';
import { JobCardLayout } from './JobCardLayout';
import { useJobCard } from './jobCardStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'JobCardGenerated'>;

/**
 * The job card exists; now record what the client said about it.
 *
 * Nothing is written to `orders` until Approved — Changes Requested has to be
 * able to loop back into the wizard with the draft intact.
 */
export function GeneratedScreen({ navigation, route }: Props) {
  const { orderId } = route.params;

  const designCode = useJobCard((state) => state.designCode);
  const jobCardCode = useJobCard((state) => state.jobCardCode);
  const needles = useJobCard((state) => state.needles);
  const stages = useJobCard((state) => state.stages);

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => getFloorOrder(orderId), [orderId]);
  const { data: order } = useQuery(fetcher);

  const repeats = order ? totalRepeats(order) : 0;
  const stageLabels = ['Embroidery', ...stageQueue(stages).map((k) => STAGE_DEFS[k].label)];

  const shareMessage = [
    `Job Card ${jobCardCode ?? ''}`.trim(),
    order ? `Order ${order.code} — ${order.clients?.name ?? ''}`.trim() : '',
    designCode ? `Design ${designCode}` : '',
    `Repeats: ${repeats}`,
    `Stitches per repeat: ${perRepeatStitches(needles).toLocaleString()}`,
    `Stages: ${stageLabels.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');

  const approve = async () => {
    if (!designCode || !jobCardCode) return;

    setWorking(true);
    setError(null);
    try {
      await approveJobCard({
        orderId,
        designCode,
        jobCardCode,
        needles,
        materials: computeMaterials(needles, repeats),
        stages,
      });
      navigation.navigate('JobCardSentToStore', { orderId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  return (
    <JobCardLayout
      title="Job Card Generated"
      trailing={order?.code}
      onBack={navigation.goBack}
      footer={
        <>
          <Button
            label="Changes Requested"
            tone="secondary"
            flex
            disabled={working}
            onPress={() => navigation.navigate('JobCardDetails', { orderId })}
            style={styles.changesButton}
          />
          <Button
            label="Approved"
            flex
            loading={working}
            onPress={approve}
            style={styles.approveButton}
          />
        </>
      }
    >
      <View style={styles.hero}>
        <View style={styles.check}>
          <Feather name="check" size={30} color={colors.success} />
        </View>
        <Text style={type.title}>Job card generated</Text>
        <Text style={[type.numeric, styles.code]}>{jobCardCode ?? '—'}</Text>
      </View>

      <ShareRow message={shareMessage} title={`Job Card ${jobCardCode ?? ''}`.trim()} />

      <Card>
        <StaticField icon="hash" label="Design Code" value={designCode ?? '—'} />
        <StaticField icon="repeat" label="Total Repeats" value={String(repeats)} />
      </Card>

      <Card>
        <Text style={type.heading}>Record the client's decision.</Text>
        <Text style={type.label}>
          Changes requested reopens the layout. Approved sends the materials list to the
          store manager.
        </Text>
      </Card>

      {error ? (
        <Card tone="danger">
          <Text style={[type.bodyStrong, styles.errorTitle]}>Could not save the job card</Text>
          <Text style={type.body}>{error}</Text>
        </Card>
      ) : null}
    </JobCardLayout>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: spacing.hair,
  },
  check: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.tight,
  },
  code: {
    color: colors.primary,
  },
  changesButton: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  approveButton: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  errorTitle: {
    color: colors.danger,
  },
});
