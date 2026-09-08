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
import { useSignedPhoto } from '../../../data/useSignedPhoto';
import { BUCKETS } from '../../../data/storage';
import { notify } from '../../../lib/alert';
import { useSession } from '../../../state/session';
import type { StaffStackParamList } from '../../../navigation/StaffStack';
import { defectTypeLabel } from '../../inspection';
import { confirmReturn, getReturnRequest, uploadProof } from '../api';

type Props = NativeStackScreenProps<StaffStackParamList, 'RaiseReturn'>;

/**
 * Take damaged sheets back to the client.
 *
 * The reasons are read, never chosen. QA already decided what was wrong with
 * each repeat during inspection, and `return_request_sheets.defect_type` holds
 * that decision; offering a picker here would let the reason the client is told
 * differ from the reason the factory recorded. `defectTypeLabel` is Inspection's
 * own copy, imported rather than restated for the same reason.
 *
 * Confirming clears the Order Taker's banner on this order — but only once no
 * pending return is left against it, which `confirm_return` checks. An order
 * with two damaged sheets raised separately keeps its alert until the second
 * one comes back.
 */
export function RaiseReturnScreen({ navigation, route }: Props) {
  const { returnRequestId } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => getReturnRequest(returnRequestId), [returnRequestId]);
  const { data: request, loading, error } = useQuery(fetcher);

  const readOnly = request?.status === 'returned';
  const storedPhoto = useSignedPhoto(BUCKETS.staffProofPhotos, request?.return_photo_url);

  const confirm = async () => {
    if (!photoUri || !factoryId) return;
    setBusy(true);
    try {
      const path = await uploadProof(factoryId, photoUri, `return-${returnRequestId}`);
      await confirmReturn(returnRequestId, path);
      navigation.goBack();
    } catch (caught) {
      notify(
        'Could not confirm the return',
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={readOnly ? 'Return' : 'Raise Return'}
        onPressBack={navigation.goBack}
      />

      {loading && !request ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error || !request ? (
        <EmptyState icon="alert-triangle" title="Could not load this return" hint={error?.message} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <StaticField
              icon="user"
              label="Client · Order"
              value={`${request.orders?.clients?.name ?? 'Unknown client'} · ${request.orders?.code ?? '—'}`}
            />

            <Card title={`Going back — ${request.return_request_sheets.length} repeats`}>
              {request.return_request_sheets.map((sheet) => (
                <View key={sheet.id} style={styles.sheetRow}>
                  <CodeChip
                    code={sheet.repeat_code}
                    state={readOnly ? 'default' : 'damaged'}
                  />
                  <View style={styles.sheetText}>
                    <Text style={type.bodyStrong} numberOfLines={1}>
                      {defectTypeLabel(sheet.defect_type)}
                    </Text>
                    <Text style={type.caption} numberOfLines={1}>
                      {sheet.flagged ? `Flagged by ${sheet.flagged.full_name}` : 'Flagged by QA'}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>

            <PhotoTile
              shape="wide"
              height={110}
              label="Return photo"
              photoUri={readOnly ? storedPhoto : photoUri}
              variant={readOnly ? 'disabled' : 'default'}
              onCapture={readOnly ? () => {} : setPhotoUri}
            />

            <NoteCard text="Confirming this clears the order taker's alert, once nothing else on the order is still outstanding." />
          </ScrollView>

          <View style={styles.footer}>
            {readOnly ? (
              <Button label="Back to Returns" tone="secondary" onPress={navigation.goBack} />
            ) : (
              <Button
                label="Confirm Return"
                icon="corner-up-left"
                disabled={!photoUri}
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
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
  },
  sheetText: {
    flex: 1,
    gap: 2,
  },
  footer: {
    padding: spacing.content,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
