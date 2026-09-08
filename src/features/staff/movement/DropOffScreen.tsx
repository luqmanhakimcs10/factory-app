import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  CodeChip,
  EmptyState,
  NoteCard,
  PhotoTile,
  StaticField,
  TopBar,
} from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { notify } from '../../../lib/alert';
import { useSession } from '../../../state/session';
import type { StaffStackParamList } from '../../../navigation/StaffStack';
import {
  confirmDropOff,
  getMovement,
  movementSubtitle,
  movementTitle,
  uploadProof,
} from '../api';

type Props = NativeStackScreenProps<StaffStackParamList, 'DropOff'>;

/**
 * Hand a set of repeats to a finishing partner.
 *
 * The photo is not optional and not a nicety: the SLA clock starts here, and a
 * disagreement three days later about what was handed over — or whether it was
 * handed over at all — has nothing to settle it otherwise. `confirm_drop_off`
 * refuses a null photo for the same reason, so the disabled button is the
 * server's rule shown early rather than a second rule of its own.
 */
export function DropOffScreen({ navigation, route }: Props) {
  const { movementId } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => getMovement(movementId), [movementId]);
  const { data: movement, loading, error } = useQuery(fetcher);

  const confirm = async () => {
    if (!photoUri || !factoryId) return;
    setBusy(true);
    try {
      const path = await uploadProof(factoryId, photoUri, `dropoff-${movementId}`);
      await confirmDropOff(movementId, path);
      navigation.goBack();
    } catch (caught) {
      notify(
        'Could not confirm the drop-off',
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Drop-off" onPressBack={navigation.goBack} />

      {loading && !movement ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error || !movement ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load this movement"
          hint={error?.message}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <StaticField
              icon="briefcase"
              label="Finishing Partner"
              value={movementTitle(movement)}
            />
            <StaticField icon="package" label="Order · Stage" value={movementSubtitle(movement)} />

            <Card title={`Going out — ${movement.codes.length} repeats`}>
              <View style={styles.codes}>
                {movement.codes.map((code) => (
                  <CodeChip key={code} code={code} state="selected" />
                ))}
              </View>
              <Text style={type.caption}>
                Every code listed here leaves the building. Nothing else does.
              </Text>
            </Card>

            <PhotoTile
              shape="wide"
              height={110}
              label="Proof of handoff"
              photoUri={photoUri}
              onCapture={setPhotoUri}
            />

            <NoteCard text="The SLA clock starts the moment this is confirmed." />
          </ScrollView>

          <View style={styles.footer}>
            <Button
              label="Confirm Drop-off"
              icon="send"
              disabled={!photoUri}
              loading={busy}
              onPress={confirm}
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
  content: {
    padding: spacing.content,
    gap: spacing.block,
  },
  loader: {
    marginTop: spacing.content * 2,
  },
  codes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight - 2,
  },
  footer: {
    padding: spacing.content,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
