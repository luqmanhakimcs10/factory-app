import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, ColorSwatch, InfoRow } from '../../../components';
import { colors, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { listClients, submitOrder } from '../api';
import { clientColorHex } from '../clientColor';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'Review'>;

/** Step 6. Last look before the order becomes real work for the floor. */
export function ReviewScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const wizard = useWizard();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => listClients(factoryId as string), [factoryId]);
  const { data: clients } = useQuery(
    fetcher,
    Boolean(factoryId) && Boolean(wizard.selectedClientId),
  );

  const existingClient = clients?.find((c) => c.id === wizard.selectedClientId);
  const clientName = wizard.newClientDraft
    ? wizard.newClientDraft.phone
    : (existingClient?.name ?? 'Unknown client');
  const clientPhone = wizard.newClientDraft?.phone ?? existingClient?.phone ?? '';
  // A new client has no id yet, so its block is keyed on the phone number —
  // the same value the row will be created with.
  const clientBlockHex = clientColorHex(
    wizard.selectedClientId ?? wizard.newClientDraft?.phone ?? 'new',
  );

  const submit = async () => {
    if (!factoryId) {
      setError('You are not signed in. Sign in again before submitting this order.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await submitOrder({
        factoryId,
        resumingOrderId: wizard.resumingOrderId,
        selectedClientId: wizard.selectedClientId,
        newClientDraft: wizard.newClientDraft,
        orderPhotoUri: wizard.orderPhotoUri,
        designSheetPhotoUri: wizard.designSheetPhotoUri,
        sheets: wizard.sheets,
      });

      // Reset here, not on the Submitted screen: the order is written, and
      // Submitted reads its code from route params, so nothing downstream
      // still needs the draft.
      navigation.navigate('Submitted', { orderCode: result.orderCode });
      wizard.reset();
    } catch (caught) {
      // The RPC is one transaction, so a failure left no partial rows behind
      // and the wizard state is untouched — the error stays on this screen and
      // the taker can press again.
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WizardLayout
      title="Review Order"
      step={6}
      onBack={navigation.goBack}
      heading="Check before submitting"
      subtext="Check everything below, then send this order for inspection."
      footer={
        <Button label="Submit Order" flex loading={submitting} onPress={submit} />
      }
    >
      <Card title="Client">
        <View style={styles.clientRow}>
          <View style={[styles.clientBlock, { backgroundColor: clientBlockHex }]}>
            <Feather name="home" size={20} color={colors.surface} />
          </View>
          <View style={styles.clientText}>
            <Text style={type.bodyStrong}>{clientName}</Text>
            {clientPhone ? <Text style={type.code}>{clientPhone}</Text> : null}
            {wizard.newClientDraft ? (
              <Text style={type.caption}>New client — will be created on submit</Text>
            ) : null}
          </View>
        </View>
      </Card>

      <Card title="Sheets">
        {wizard.sheets.map((sheet, index) => (
          <View key={`${sheet.colorId}-${index}`} style={styles.sheetRow}>
            <ColorSwatch
              colorId={sheet.colorId}
              customHex={sheet.customHex}
              size={20}
              interactive={false}
            />
            <Text style={type.body}>
              {sheet.repeats} {sheet.repeats === 1 ? 'repeat' : 'repeats'}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <InfoRow
          icon="layers"
          label="Sheets"
          subLabel={`${wizard.sheets.length} ${wizard.sheets.length === 1 ? 'sheet' : 'sheets'} in this order`}
          divider
        />
        {/* Order Photo is a required step, so there is no "not added" state. */}
        <InfoRow icon="camera" label="Proof Photo" subLabel="Added" tone="success" divider />

        <View style={styles.designRow}>
          <InfoRow
            icon="file-text"
            label="Design Sheet"
            subLabel={
              wizard.designSheetPhotoUri ? 'Added' : 'Not added — client did not give one'
            }
            tone={wizard.designSheetPhotoUri ? 'success' : 'default'}
            style={styles.designInfo}
          />
          {wizard.designSheetPhotoUri ? (
            // Sends the taker back to the Design Sheet step to retake or skip
            // it, rather than deleting the photo from under them here.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change design sheet photo"
              hitSlop={10}
              onPress={() => navigation.navigate('DesignSheet')}
              style={styles.removeButton}
            >
              <Feather name="x" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </Card>

      {error ? (
        <Card tone="danger">
          <Text style={[type.bodyStrong, styles.errorTitle]}>Could not submit</Text>
          <Text style={type.body}>{error}</Text>
          <Text style={type.caption}>
            Nothing was written — your order is still here. Try again.
          </Text>
        </Card>
      ) : null}
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
  },
  clientBlock: {
    width: 44,
    height: 44,
    borderRadius: radius.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientText: {
    flex: 1,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
  },
  designRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  designInfo: {
    flex: 1,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    color: colors.danger,
  },
});
