import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Button,
  Card,
  CodeChip,
  ColorSwatch,
  EmptyState,
  PhotoTile,
  TopBar,
} from '../../../components';
import { colors, fonts, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSignedPhoto } from '../../../data/useSignedPhoto';
import { BUCKETS } from '../../../data/storage';
import { getSwatch } from '../../../data/swatches';
import { notify } from '../../../lib/alert';
import { useSession } from '../../../state/session';
import type { StaffStackParamList } from '../../../navigation/StaffStack';
import { getDeliveryOrder, markDelivered, sheetCodes, uploadProof } from '../api';

type Props = NativeStackScreenProps<StaffStackParamList, 'Deliver'>;

/**
 * Hand a finished order to the client.
 *
 * This is the event that creates money owed. `mark_delivered` sets
 * `orders.delivered_at`, and the Accountant's Receivables tab filters on
 * exactly that — so an order that is fully stitched, finished and sitting in
 * the van owes nothing until this button is pressed. Both proofs are required
 * by the RPC as well as by the button: a receivable with no evidence behind it
 * is the one a client disputes.
 *
 * The signature is a typed name rather than a drawn one. `mark_delivered` takes
 * `p_signature_name` — a name, not an image — and there is no bucket or column
 * for a drawn signature to live in, so a canvas here would have to be thrown
 * away on submit. A typed confirmation is the honest version of the field that
 * actually exists.
 *
 * Reopening a delivered order is read-only: this screen records that a thing
 * happened, and afterwards there is nothing left to decide.
 */
export function DeliverScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => getDeliveryOrder(orderId), [orderId]);
  const { data: order, loading, error } = useQuery(fetcher);

  const readOnly = order?.delivered_at !== null && order !== null;
  const storedPhoto = useSignedPhoto(BUCKETS.staffProofPhotos, order?.delivery_photo_url);
  const clientPhoto = useSignedPhoto(BUCKETS.clientPhotos, order?.clients?.photo_url);

  const signed = signature.trim().length > 0;

  const confirm = async () => {
    if (!photoUri || !signed || !factoryId) return;
    setBusy(true);
    try {
      const path = await uploadProof(factoryId, photoUri, `delivery-${orderId}`);
      await markDelivered(orderId, path, signature.trim());
      navigation.replace('DeliveryDone', {
        orderCode: order?.code ?? '',
        clientName: order?.clients?.name ?? '',
      });
    } catch (caught) {
      notify(
        'Could not mark this delivered',
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Deliver" onPressBack={navigation.goBack} />

      {loading && !order ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error || !order ? (
        <EmptyState icon="alert-triangle" title="Could not load this order" hint={error?.message} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <View style={styles.clientRow}>
                {clientPhoto ? (
                  <Image source={{ uri: clientPhoto }} style={styles.clientPhoto} />
                ) : (
                  <View style={[styles.clientPhoto, styles.clientPhotoEmpty]}>
                    <Feather name="user" size={20} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.clientText}>
                  <Text style={type.bodyStrong} numberOfLines={1}>
                    {order.clients?.name ?? 'Unknown client'}
                  </Text>
                  <Text style={type.code} numberOfLines={1}>
                    {order.clients?.phone ?? '—'}
                  </Text>
                </View>
                <Text style={type.code}>{order.code}</Text>
              </View>
            </Card>

            <View style={styles.addressCard}>
              <View style={styles.addressIcon}>
                <Feather name="map-pin" size={16} color={colors.primary} />
              </View>
              <Text style={[type.body, styles.addressText]}>
                {order.clients?.address ?? 'No address on file'}
              </Text>
            </View>

            <Card title={`Going out — ${order.order_sheets.length} sheets`}>
              {order.order_sheets.map((sheet, index) => (
                <View key={sheet.id} style={styles.sheetRow}>
                  <ColorSwatch
                    colorId={sheet.color_id}
                    customHex={sheet.custom_hex}
                    size={28}
                    interactive={false}
                  />
                  <View style={styles.sheetText}>
                    <Text style={type.bodyStrong} numberOfLines={1}>
                      {getSwatch(sheet.color_id)?.label ?? sheet.color_id}
                    </Text>
                    <View style={styles.codes}>
                      {sheetCodes(order, index).map((code) => (
                        <CodeChip key={code} code={code} />
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </Card>

            <PhotoTile
              shape="wide"
              height={110}
              label="Delivery photo"
              photoUri={readOnly ? storedPhoto : photoUri}
              variant={readOnly ? 'disabled' : 'default'}
              onCapture={readOnly ? () => {} : setPhotoUri}
            />

            <SignatureField
              value={readOnly ? (order.delivery_signature_name ?? '') : signature}
              readOnly={readOnly}
              onChange={setSignature}
            />
          </ScrollView>

          <View style={styles.footer}>
            {readOnly ? (
              <Button label="Back to Deliveries" tone="secondary" onPress={navigation.goBack} />
            ) : (
              <Button
                label="Mark Delivered"
                icon="check"
                disabled={!photoUri || !signed}
                loading={busy}
                onPress={confirm}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}

/**
 * The client confirms receipt by typing their name.
 *
 * Once signed it renders in the script face and stops being editable, which is
 * what makes it read as a signature rather than another text box — but the
 * value it carries is a name, and the screen never pretends otherwise.
 */
function SignatureField({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  onChange: (next: string) => void;
}) {
  const signed = value.trim().length > 0;

  return (
    <View style={[styles.sigPad, signed && styles.sigPadSigned]}>
      <Text style={[type.caption, styles.sigLabel]}>CLIENT SIGNATURE</Text>
      {readOnly ? (
        <Text style={styles.sigValue} numberOfLines={1}>
          {value || 'Not signed'}
        </Text>
      ) : (
        <TextInput
          accessibilityLabel="Client signature: type the client's name to confirm receipt"
          value={value}
          onChangeText={onChange}
          placeholder="Type name to confirm receipt"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          style={[styles.sigInput, signed && styles.sigValue]}
        />
      )}
      {signed ? <Text style={type.caption}>Signed on delivery</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.content,
    gap: spacing.block,
  },
  loader: {
    marginTop: spacing.content * 2,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
  },
  clientPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
  },
  clientPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientText: {
    flex: 1,
    gap: 2,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    padding: spacing.content - 2,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  addressIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutralAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressText: {
    flex: 1,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.tight + 2,
  },
  sheetText: {
    flex: 1,
    gap: spacing.hair,
  },
  codes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight - 2,
  },
  sigPad: {
    padding: spacing.content - 2,
    gap: spacing.tight,
    borderRadius: radius.tile,
    borderWidth: layout.hairline * 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sigPadSigned: {
    borderStyle: 'solid',
    borderColor: colors.success,
    backgroundColor: colors.successBg,
  },
  sigLabel: {
    letterSpacing: 0.5,
  },
  sigInput: {
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
    paddingVertical: spacing.hair,
  },
  sigValue: {
    fontFamily: fonts.condensed.semibold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.success,
    paddingVertical: spacing.hair,
  },
  footer: {
    padding: spacing.content,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
