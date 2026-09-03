import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  EmptyState,
  MaterialRow,
  PhotoTile,
  StaticField,
  TopBar,
} from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { getSwatch } from '../../../data/swatches';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { acceptMaterials, getFloorOrder } from '../api';
import { useHomeTab } from '../homeTabStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'CollectDetail'>;

/**
 * Collecting the issued materials.
 *
 * The checklist and the proof photo are the `collectDraft` — deliberately local
 * to this screen, so they cannot survive into another order's collection.
 */
export function CollectDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const profile = useSession((state) => state.profile);
  const setActiveTab = useHomeTab((state) => state.setActiveTab);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => getFloorOrder(orderId), [orderId]);
  const { data: order, loading } = useQuery(fetcher);

  const materials = order?.materials ?? [];
  const allChecked =
    materials.length > 0 && materials.every((entry) => checked[entry.color_id]);
  const canAccept = allChecked && Boolean(photoUri);

  const accept = async () => {
    if (!photoUri || !profile) return;

    setWorking(true);
    setError(null);
    try {
      await acceptMaterials({ factoryId: profile.factory_id, orderId, photoUri });
      setActiveTab('inventory');
      navigation.navigate('Home');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={order?.design_code ?? 'Collect Materials'}
        trailing={order?.code}
        onPressBack={navigation.goBack}
      />

      {loading && !order ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !order ? (
        <EmptyState icon="alert-triangle" title="Could not load this collection" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <StaticField icon="hash" label="Design Code" value={order.design_code ?? '—'} />
              <StaticField
                icon="clipboard"
                label="Job Card"
                value={order.job_card_code ?? '—'}
              />
            </Card>

            <Card title="Check off each item">
              {materials.length === 0 ? (
                <EmptyState icon="inbox" title="No materials to collect" />
              ) : (
                materials.map((entry) => (
                  <MaterialRow
                    key={entry.color_id}
                    colorId={entry.color_id}
                    label={getSwatch(entry.color_id)?.label ?? entry.color_id}
                    quantity={`${entry.qty_grams} g`}
                    checkable
                    checked={Boolean(checked[entry.color_id])}
                    onToggle={() =>
                      setChecked((current) => ({
                        ...current,
                        [entry.color_id]: !current[entry.color_id],
                      }))
                    }
                  />
                ))
              )}
            </Card>

            <Card title="Proof of collection">
              <PhotoTile
                shape="wide"
                height={180}
                photoUri={photoUri}
                label={photoUri ? 'Photo added' : 'Tap to photograph the collected items'}
                onCapture={setPhotoUri}
              />
            </Card>

            {error ? (
              <Card tone="danger">
                <Text style={[type.bodyStrong, styles.errorTitle]}>
                  Could not accept the materials
                </Text>
                <Text style={type.body}>{error}</Text>
              </Card>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, spacing.content) },
            ]}
          >
            <Button
              label="Accept"
              flex
              disabled={!canAccept}
              loading={working}
              onPress={accept}
            />
          </View>
        </>
      )}
    </View>
  );
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
  errorTitle: {
    color: colors.danger,
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
