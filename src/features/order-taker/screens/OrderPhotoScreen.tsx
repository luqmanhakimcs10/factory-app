import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, PhotoTile } from '../../../components';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'OrderPhoto'>;

/**
 * Step 3. One proof photo for the whole order.
 *
 * Unlike the design sheet later, this step is not skippable: the proof photo is
 * what QA compares every unit against, so an order without one cannot be
 * inspected.
 */
export function OrderPhotoScreen({ navigation }: Props) {
  const orderPhotoUri = useWizard((state) => state.orderPhotoUri);
  const setOrderPhotoUri = useWizard((state) => state.setOrderPhotoUri);
  const setCurrentSheetIndex = useWizard((state) => state.setCurrentSheetIndex);

  const goNext = () => {
    setCurrentSheetIndex(0);
    navigation.navigate('SheetForm');
  };

  return (
    <WizardLayout
      title="New Order"
      step={3}
      onBack={navigation.goBack}
      heading="Proof Photo"
      subtext="One photo covering all the sheets in this order."
      footer={
        <>
          <Button label="Back" tone="secondary" flex onPress={navigation.goBack} />
          <Button
            label="Continue"
            flex
            disabled={!orderPhotoUri}
            onPress={goNext}
          />
        </>
      }
    >
      <Card>
        <PhotoTile
          shape="wide"
          height={180}
          photoUri={orderPhotoUri}
          label={orderPhotoUri ? 'Photo added' : 'Tap to photograph the sheets'}
          onCapture={setOrderPhotoUri}
        />
      </Card>
    </WizardLayout>
  );
}
