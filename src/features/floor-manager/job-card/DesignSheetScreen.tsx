import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, PhotoTile, StaticField } from '../../../components';
import { spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { getFloorOrder } from '../api';
import { JobCardLayout } from './JobCardLayout';
import { useJobCard } from './jobCardStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'JobCardDesignSheet'>;

/**
 * Step 1 of the job card.
 *
 * The photo lives on the draft only. Nothing writes it to `orders` — the Order
 * Taker already stores its own design-sheet photo there, and the spec does not
 * say this second capture should replace it. Flagged as an open question.
 */
export function DesignSheetScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const photoUri = useJobCard((state) => state.designSheetPhotoUri);
  const setPhotoUri = useJobCard((state) => state.setDesignSheetPhotoUri);

  const fetcher = useCallback(() => getFloorOrder(orderId), [orderId]);
  const { data: order } = useQuery(fetcher);

  return (
    <JobCardLayout
      title="Job Card"
      step={1}
      trailing={order?.code}
      onBack={navigation.goBack}
      heading="Design sheet"
      subtext="Photograph the client's design sheet to load stitch and colour details."
      footer={
        <>
          <Button label="Back" tone="secondary" flex onPress={navigation.goBack} />
          <Button
            label="Next"
            flex
            disabled={!photoUri}
            onPress={() => navigation.navigate('JobCardDetails', { orderId })}
          />
        </>
      }
    >
      <View style={styles.fields}>
        <StaticField icon="hash" label="Order" value={order?.code ?? '—'} />
        <StaticField
          icon="user"
          label="Client"
          value={order?.clients?.name ?? '—'}
        />
      </View>

      <Card>
        <PhotoTile
          shape="wide"
          height={200}
          photoUri={photoUri}
          label={photoUri ? 'Photo added' : 'Tap to photograph the design sheet'}
          onCapture={setPhotoUri}
        />
        <Text style={type.caption}>
          Kept on this job card only — it is not written back to the order.
        </Text>
      </Card>
    </JobCardLayout>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.tight,
  },
});
