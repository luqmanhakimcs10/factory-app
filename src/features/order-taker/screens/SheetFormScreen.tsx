import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, ColorSwatch, Stepper } from '../../../components';
import { spacing, type } from '../../../theme';
import { CUSTOM_SWATCH_ID, SWATCHES } from '../../../data/swatches';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'SheetForm'>;

/**
 * Step 4, looped once per sheet — the dots stay on 4 the whole way through.
 *
 * Colour and repeats only. The proof photo moved to its own order-level step,
 * so there is nothing photographic to validate here.
 */
export function SheetFormScreen({ navigation }: Props) {
  const sheetCount = useWizard((state) => state.sheetCount);
  const sheets = useWizard((state) => state.sheets);
  const index = useWizard((state) => state.currentSheetIndex);
  const setSheet = useWizard((state) => state.setSheet);
  const setCurrentSheetIndex = useWizard((state) => state.setCurrentSheetIndex);

  const saved = sheets[index];
  const [colorId, setColorId] = useState(saved?.colorId ?? '');
  const [customHex, setCustomHex] = useState<string | null>(saved?.customHex ?? null);
  const [repeats, setRepeats] = useState(saved?.repeats ?? 1);

  // The loop reuses one screen instance, so moving between sheets has to
  // re-seed the local draft from the store rather than relying on a remount.
  useEffect(() => {
    const current = sheets[index];
    setColorId(current?.colorId ?? '');
    setCustomHex(current?.customHex ?? null);
    setRepeats(current?.repeats ?? 1);
    // Re-seeding is keyed on the index alone; `sheets` is read at that moment
    // on purpose, so typing into the current sheet does not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const isFirst = index === 0;
  const isLast = index === sheetCount - 1;

  const goBack = () => {
    if (isFirst) {
      // First sheet steps back to Order Photo, not Sheet Count.
      navigation.goBack();
      return;
    }
    setCurrentSheetIndex(index - 1);
  };

  const saveSheet = () => {
    setSheet(index, { colorId, customHex, repeats });

    if (isLast) {
      navigation.navigate('DesignSheet');
      return;
    }
    setCurrentSheetIndex(index + 1);
  };

  // Ten palette colours laid out as two rows of five, with `custom` sitting
  // apart from them — it is a different kind of choice, not an eleventh colour.
  const paletteSwatches = SWATCHES.filter((swatch) => swatch.id !== CUSTOM_SWATCH_ID);
  const customSwatch = SWATCHES.find((swatch) => swatch.id === CUSTOM_SWATCH_ID);

  const pickColor = (id: string) => {
    setColorId(id);
    // No custom-colour picker exists yet, so `custom` is recorded with a null
    // hex and resolved downstream as a placeholder.
    setCustomHex(null);
  };

  return (
    <WizardLayout
      title={`Sheet ${index + 1} of ${sheetCount}`}
      step={4}
      trailing={`${index + 1}/${sheetCount}`}
      onBack={goBack}
      heading="What colour is this sheet?"
      subtext="Pick the thread colour, then set how many repeats it carries."
      footer={
        <>
          <Button label="Back" tone="secondary" flex onPress={goBack} />
          <Button label="Save Sheet" flex disabled={!colorId} onPress={saveSheet} />
        </>
      }
    >
      <Card title="Colour">
        <View style={styles.grid}>
          {paletteSwatches.map((swatch) => (
            <View key={swatch.id} style={styles.cell}>
              <ColorSwatch
                colorId={swatch.id}
                size={44}
                variant={swatch.id === colorId ? 'selected' : 'default'}
                onPress={() => pickColor(swatch.id)}
              />
            </View>
          ))}
        </View>

        {customSwatch ? (
          <View style={styles.customRow}>
            <ColorSwatch
              colorId={customSwatch.id}
              customHex={colorId === customSwatch.id ? customHex : null}
              size={44}
              variant={colorId === customSwatch.id ? 'selected' : 'default'}
              onPress={() => pickColor(customSwatch.id)}
            />
            <View style={styles.customText}>
              <Text style={type.bodyStrong}>Custom colour</Text>
              <Text style={type.caption}>
                Recorded as custom — the exact shade is picked later.
              </Text>
            </View>
          </View>
        ) : null}
      </Card>

      <Card title="Repeats">
        <Stepper
          size="repeats"
          value={repeats}
          min={1}
          onChange={setRepeats}
          unitLabel={repeats === 1 ? 'repeat' : 'repeats'}
        />
      </Card>
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.block,
  },
  cell: {
    // Five per row on any device width — a fixed gap would wrap to four on
    // narrow phones and leave a ragged second row.
    width: '20%',
    alignItems: 'center',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    marginTop: spacing.tight,
  },
  customText: {
    flex: 1,
  },
});
