import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, PhotoTile } from '../../../components';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'DesignSheet'>;

/**
 * Step 5. Optional — plenty of clients turn up without a design sheet, so Skip
 * leaves `designSheetPhotoUri` null and both paths land on Review.
 */
export function DesignSheetScreen({ navigation }: Props) {
  const designSheetPhotoUri = useWizard((state) => state.designSheetPhotoUri);
  const setDesignSheetPhotoUri = useWizard((state) => state.setDesignSheetPhotoUri);

  const skip = () => {
    setDesignSheetPhotoUri(null);
    navigation.navigate('Review');
  };

  return (
    <WizardLayout
      title="New Order"
      step={5}
      onBack={navigation.goBack}
      heading="Design sheet"
      subtext="Only if the client gave you one — otherwise skip."
      footer={
        <>
          <Button label="Skip" tone="ghost" flex onPress={skip} />
          <Button label="Continue" flex onPress={() => navigation.navigate('Review')} />
        </>
      }
    >
      <Card>
        <PhotoTile
          shape="wide"
          height={180}
          photoUri={designSheetPhotoUri}
          label={designSheetPhotoUri ? 'Photo added' : 'Tap to photograph the design sheet'}
          onCapture={setDesignSheetPhotoUri}
        />
      </Card>
    </WizardLayout>
  );
}
