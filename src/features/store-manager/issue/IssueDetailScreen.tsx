import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  EmptyState,
  MaterialRow,
  NoteCard,
  PhotoTile,
  StaticField,
  TopBar,
} from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { getSwatch } from '../../../data/swatches';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import { getIssueOrder, issueOrderMaterials } from '../api';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'IssueDetail'>;

/**
 * PROPOSED SCREEN — inferred, not observed.
 *
 * No screenshot exists for it. It is built by direct analogy with the Floor
 * Manager's Collect Detail screen, mirrored to the issuing side, because
 * without it the `materialRequested -> readyToCollect` transition has no
 * trigger anywhere in the app and the Floor Manager module waits forever.
 *
 * Reads:  orders where floor_status = 'materialRequested'
 * Writes: floor_status = 'readyToCollect', issued_by, issued_date, via the
 *         issue_order_materials RPC.
 * Role:   store_manager only.
 */
export function IssueDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const factoryId = useSession((state) => state.profile?.factory_id);

  // The checklist and photo are local to this screen so they cannot survive
  // into the next order's handover.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => getIssueOrder(orderId), [orderId]);
  const { data: order, loading } = useQuery(fetcher);

  const materials = order?.materials ?? [];
  const allChecked =
    materials.length > 0 && materials.every((entry) => checked[entry.color_id]);
  const canIssue = allChecked && Boolean(photoUri) && Boolean(factoryId);

  const issue = async () => {
    if (!photoUri || !factoryId) return;

    setWorking(true);
    setError(null);
    try {
      await issueOrderMaterials({ factoryId, orderId, photoUri });
      navigation.goBack();
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
        title="Issue Materials"
        trailing={order?.code}
        onPressBack={navigation.goBack}
      />

      {loading && !order ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !order ? (
        <EmptyState icon="alert-triangle" title="Could not load this order" />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <StaticField icon="hash" label="Design Code" value={order.design_code ?? '—'} />
              <StaticField icon="user" label="Client" value={order.clients?.name ?? '—'} />
            </Card>

            <Card title="Check off each item as you hand it over">
              {materials.length === 0 ? (
                <EmptyState icon="inbox" title="No materials on this request" />
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

            <Card title="Proof of issue">
              <PhotoTile
                shape="wide"
                height={180}
                photoUri={photoUri}
                label={photoUri ? 'Photo added' : 'Tap to photograph the issued items'}
                onCapture={setPhotoUri}
              />
            </Card>

            <NoteCard text="Once issued, the floor manager collects these items and confirms receipt on their own screen." />

            {error ? (
              <Card tone="danger">
                <Text style={[type.bodyStrong, styles.errorTitle]}>
                  Could not issue the materials
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
              label="Issue"
              flex
              disabled={!canIssue}
              loading={working}
              onPress={issue}
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
