import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, StageGrid } from '../../../components';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { JobCardLayout } from './JobCardLayout';
import { useJobCard } from './jobCardStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'JobCardStages'>;

/** Step 3. Which finishing stages follow embroidery on this order. */
export function StagesScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const stages = useJobCard((state) => state.stages);
  const setStages = useJobCard((state) => state.setStages);

  return (
    <JobCardLayout
      title="Production Stages"
      step={3}
      onBack={navigation.goBack}
      heading="Production stages"
      subtext="Embroidery always runs first."
      footer={
        <>
          <Button label="Back" tone="secondary" flex onPress={navigation.goBack} />
          <Button
            label="Next"
            flex
            onPress={() => navigation.navigate('JobCardReview', { orderId })}
          />
        </>
      }
    >
      <Card>
        <StageGrid value={stages} onChange={setStages} />
      </Card>
    </JobCardLayout>
  );
}
