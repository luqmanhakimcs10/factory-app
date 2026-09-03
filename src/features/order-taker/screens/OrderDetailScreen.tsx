import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Button,
  Card,
  ColorSwatch,
  EmptyState,
  StatusPill,
  Timeline,
  TopBar,
  type PillStatus,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { BUCKETS } from '../../../data/storage';
import { useQuery } from '../../../data/useQuery';
import { useSignedPhoto } from '../../../data/useSignedPhoto';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { clientColorHex } from '../clientColor';
import { getOrderDetail, resolveOrderAlert } from '../api';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'OrderDetail'>;

export function OrderDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const hydrateFromDraft = useWizard((state) => state.hydrateFromDraft);
  const [resolving, setResolving] = useState(false);

  const fetcher = useCallback(() => getOrderDetail(orderId), [orderId]);
  const { data: order, loading, error, refetch } = useQuery(fetcher);

  const clientPhoto = useSignedPhoto(BUCKETS.clientPhotos, order?.clients?.photo_url);
  const isDraft = order?.status === 'draft';

  const markResolved = async () => {
    setResolving(true);
    try {
      await resolveOrderAlert(orderId);
      refetch();
    } finally {
      setResolving(false);
    }
  };

  const continueOrder = () => {
    if (!order) return;

    // Resume lands on Sheet Count, not Order Photo: the sheet count is the
    // decision the taker was in the middle of, and everything after it is
    // re-walked anyway.
    hydrateFromDraft({
      orderId: order.id,
      clientId: order.client_id,
      orderPhotoUri: order.proof_photo_url,
      designSheetPhotoUri: order.design_sheet_photo_url,
      sheets: order.order_sheets.map((sheet) => ({
        colorId: sheet.color_id,
        customHex: sheet.custom_hex,
        repeats: sheet.repeats,
      })),
    });
    navigation.navigate('SheetCount');
  };

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={order?.code ?? 'Order'}
        onPressBack={navigation.goBack}
      />

      {loading && !order ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error || !order ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load this order"
          hint={error?.message}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {order.alert_text ? (
              <Card tone="danger">
                <Text style={[type.heading, styles.alertTitle]}>Alert</Text>
                <Text style={type.body}>{order.alert_text}</Text>
                <Button
                  label="Mark Resolved"
                  tone="danger"
                  loading={resolving}
                  onPress={markResolved}
                />
              </Card>
            ) : null}

            <Card>
              <View style={styles.statusRow}>
                <StatusPill status={statusToPill(order.status)} />
                <Text style={type.code}>{order.code}</Text>
              </View>

              <View style={styles.clientRow}>
                <View
                  style={[
                    styles.clientPhoto,
                    { backgroundColor: clientColorHex(order.client_id) },
                  ]}
                >
                  {clientPhoto ? (
                    <Image source={{ uri: clientPhoto }} style={styles.clientImage} />
                  ) : (
                    <Feather name="home" size={20} color={colors.surface} />
                  )}
                </View>
                <View style={styles.clientText}>
                  <Text style={type.bodyStrong} numberOfLines={1}>
                    {order.clients?.name ?? 'Unknown client'}
                  </Text>
                  {order.clients?.phone ? (
                    <Text style={type.code}>{order.clients.phone}</Text>
                  ) : null}
                </View>
              </View>
            </Card>

            {isDraft ? (
              // A draft has nothing worth showing yet — its sheets are whatever
              // the taker had got to before walking away, and it has not
              // entered the pipeline, so there is no timeline either.
              <Card>
                <EmptyState
                  icon="edit-3"
                  title="This order is still a draft"
                  hint="Pick it back up to finish the sheets and send it for inspection."
                />
              </Card>
            ) : (
              <>
                <Card title="Sheets">
                  {order.order_sheets.map((sheet) => (
                    <View key={sheet.id} style={styles.sheetRow}>
                      <ColorSwatch
                        colorId={sheet.color_id}
                        customHex={sheet.custom_hex}
                        size={20}
                        interactive={false}
                      />
                      <Text style={type.body}>
                        {sheet.repeats} {sheet.repeats === 1 ? 'repeat' : 'repeats'}
                      </Text>
                    </View>
                  ))}
                </Card>

                {order.stage ? (
                  <Card title="Progress">
                    {/* Read-only here — the QA module drives the stage. */}
                    <Timeline currentStage={order.stage} />
                  </Card>
                ) : null}
              </>
            )}
          </ScrollView>

          {isDraft ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, spacing.content) },
              ]}
            >
              <Button label="Continue Order" flex onPress={continueOrder} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function statusToPill(status: 'draft' | 'in_progress' | 'completed'): PillStatus {
  return status === 'in_progress' ? 'progress' : status;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loader: {
    marginTop: spacing.content * 3,
  },
  content: {
    padding: spacing.content,
    gap: spacing.block,
  },
  alertTitle: {
    color: colors.danger,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
  },
  clientPhoto: {
    width: 44,
    height: 44,
    borderRadius: radius.icon,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clientImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  clientText: {
    flex: 1,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
