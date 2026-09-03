import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, NumericKeypadSheet, PhotoTile } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'NewClient'>;

const MIN_PHONE_DIGITS = 4;

/**
 * Step 1 still — New Client is a sub-step of Pick Client and shares its dot.
 * The photo stays a local URI; it uploads with everything else at submit.
 */
export function NewClientScreen({ navigation }: Props) {
  const draft = useWizard((state) => state.newClientDraft);
  const setNewClientDraft = useWizard((state) => state.setNewClientDraft);

  const [photoUri, setPhotoUri] = useState<string | null>(draft?.photoUri ?? null);
  const [phone, setPhone] = useState(draft?.phone ?? '');
  const [keypadOpen, setKeypadOpen] = useState(false);

  const canSave = Boolean(photoUri) && phone.length >= MIN_PHONE_DIGITS;

  const save = () => {
    setNewClientDraft({ photoUri, phone });
    navigation.navigate('SheetCount');
  };

  return (
    <WizardLayout
      title="New Client"
      step={1}
      onBack={navigation.goBack}
      heading="Add a new client"
      subtext="Photograph the shop and take a phone number."
      footer={<Button label="Save Client" flex disabled={!canSave} onPress={save} />}
    >
      <Card title="Shop photo">
        <PhotoTile
          shape="wide"
          height={180}
          photoUri={photoUri}
          label={photoUri ? 'Photo added' : 'Tap to photograph the shop'}
          onCapture={setPhotoUri}
        />
      </Card>

      <Card title="Phone number">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter phone number"
          onPress={() => setKeypadOpen(true)}
          style={styles.phoneField}
        >
          <Feather name="phone" size={18} color={colors.textSecondary} />
          <Text style={[type.code, styles.phoneValue, !phone && styles.phonePlaceholder]}>
            {phone || 'Tap to enter number'}
          </Text>
          <Feather name="edit-2" size={16} color={colors.textMuted} />
        </Pressable>
      </Card>

      <NumericKeypadSheet
        visible={keypadOpen}
        title="Client phone number"
        initialValue={phone}
        placeholder="Enter phone number"
        minLength={MIN_PHONE_DIGITS}
        maxLength={11}
        onSubmit={(digits) => {
          setPhone(digits);
          setKeypadOpen(false);
        }}
        onClose={() => setKeypadOpen(false)}
      />

      <View style={styles.hintRow}>
        <Feather name="info" size={14} color={colors.textMuted} />
        <Text style={type.caption}>
          Both the photo and a {MIN_PHONE_DIGITS}-digit number are needed before you can save.
        </Text>
      </View>
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  phoneField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingHorizontal: spacing.content - 2,
    paddingVertical: spacing.tight + 4,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  phoneValue: {
    flex: 1,
    fontSize: 17,
    color: colors.textPrimary,
  },
  phonePlaceholder: {
    color: colors.textMuted,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.hair + 2,
  },
});
