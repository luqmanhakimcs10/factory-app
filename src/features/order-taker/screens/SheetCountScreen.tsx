import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, Stepper } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'SheetCount'>;

/**
 * Step 2. Continue sizes the sheet drafts and goes to Order Photo — the proof
 * photo is taken once, before the per-sheet loop, because it covers the whole
 * stack rather than any one colour.
 */
export function SheetCountScreen({ navigation }: Props) {
  const sheetCount = useWizard((state) => state.sheetCount);
  const setSheetCount = useWizard((state) => state.setSheetCount);
  const initSheets = useWizard((state) => state.initSheets);

  const goNext = () => {
    initSheets();
    navigation.navigate('OrderPhoto');
  };

  return (
    <WizardLayout
      title="New Order"
      step={2}
      onBack={navigation.goBack}
      heading="How many sheets in this order?"
      subtext="Count the fabric sheets in this order — one per colour."
      footer={
        <>
          <Button label="Back" tone="secondary" flex onPress={navigation.goBack} />
          <Button label="Continue" flex onPress={goNext} />
        </>
      }
    >
      <View style={styles.paletteBadge}>
        <Feather name="droplet" size={22} color={colors.primary} />
      </View>

      <Card>
        <Stepper
          size="count"
          value={sheetCount}
          min={1}
          onChange={setSheetCount}
          unitLabel={sheetCount === 1 ? 'sheet' : 'sheets'}
        />
      </Card>
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  paletteBadge: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: radius.tile,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.tight,
  },
});
