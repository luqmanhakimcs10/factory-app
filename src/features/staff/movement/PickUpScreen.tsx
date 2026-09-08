import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Button,
  Card,
  CodeChip,
  EmptyState,
  NoteCard,
  PhotoTile,
  SlaStrip,
  StaticField,
  TopBar,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSignedPhoto } from '../../../data/useSignedPhoto';
import { BUCKETS } from '../../../data/storage';
import { notify } from '../../../lib/alert';
import { useSession } from '../../../state/session';
import type { StaffStackParamList } from '../../../navigation/StaffStack';
import {
  confirmPickup,
  getMovement,
  movementHoursLeft,
  movementTitle,
  uploadProof,
} from '../api';

type Props = NativeStackScreenProps<StaffStackParamList, 'PickUp'>;

/** Per-repeat verdict. `null` means not yet looked at, which is not the same as fine. */
type Verdict = 'ok' | 'damaged';

/**
 * Collect a set of repeats back from a finishing partner.
 *
 * The checklist is per repeat, not per movement, because damage is: a partner
 * can return nine clean repeats and one with a stain, and a single blanket
 * "damaged" toggle would either write off the nine or hide the one. Nothing can
 * be confirmed until every code has been given a verdict — "not looked at" and
 * "looked at, fine" are different facts and the button will not treat the first
 * as the second.
 *
 * This screen flags damage and stops. It never records a defect type and never
 * says whose fault it was: that is Inspection's decision, made on Inspection's
 * screen with Inspection's vocabulary, and a second place to enter it is a
 * second answer to disagree with the first.
 *
 * Reopening a collected movement is read-only. The record of what came back
 * damaged is evidence in a conversation with a partner about money; it is not
 * a form that stays editable afterwards.
 */
export function PickUpScreen({ navigation, route }: Props) {
  const { movementId } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => getMovement(movementId), [movementId]);
  const { data: movement, loading, error } = useQuery(fetcher);

  const readOnly = movement?.status === 'returned';
  const storedPhoto = useSignedPhoto(BUCKETS.staffProofPhotos, movement?.pickup_photo_url);

  const codes = movement?.codes ?? [];
  const allChecked = codes.length > 0 && codes.every((code) => verdicts[code] !== undefined);

  const confirm = async () => {
    if (!photoUri || !factoryId || !allChecked) return;
    setBusy(true);
    try {
      const path = await uploadProof(factoryId, photoUri, `pickup-${movementId}`);
      const damaged = codes.filter((code) => verdicts[code] === 'damaged');
      await confirmPickup(movementId, path, damaged);
      navigation.goBack();
    } catch (caught) {
      notify(
        'Could not record the collection',
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Pick Up" onPressBack={navigation.goBack} />

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

            <SlaStrip
              hoursLeft={movementHoursLeft(movement)}
              caption={
                readOnly && movement.returned_at
                  ? `Collected ${new Date(movement.returned_at).toLocaleDateString()}`
                  : undefined
              }
            />

            <Card title={readOnly ? 'What came back' : 'Check every repeat'}>
              {codes.map((code) => (
                <RepeatRow
                  key={code}
                  code={code}
                  verdict={
                    readOnly
                      ? // A collected movement stores only how many were
                        // damaged, not which — the per-code verdicts were the
                        // input to that count, not a column of their own. Shown
                        // neutral rather than guessed at.
                        null
                      : (verdicts[code] ?? null)
                  }
                  readOnly={readOnly}
                  onSet={(verdict) => setVerdicts((prev) => ({ ...prev, [code]: verdict }))}
                />
              ))}
              {readOnly ? (
                <Text style={type.caption}>
                  {movement.damaged_count > 0
                    ? `${movement.damaged_count} of ${codes.length} came back damaged.`
                    : 'All repeats came back clear.'}
                </Text>
              ) : null}
            </Card>

            <PhotoTile
              shape="wide"
              height={110}
              label="Proof of collection"
              photoUri={readOnly ? storedPhoto : photoUri}
              variant={readOnly ? 'disabled' : 'default'}
              onCapture={readOnly ? () => {} : setPhotoUri}
            />

            <NoteCard text="QA records the damage and decides who is accountable, not you." />
          </ScrollView>

          <View style={styles.footer}>
            {readOnly ? (
              <Button label="Back" tone="secondary" onPress={navigation.goBack} />
            ) : (
              <Button
                label="Hand Over to QA"
                icon="check"
                disabled={!allChecked || !photoUri}
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

/** One code, and the two answers it can have. */
function RepeatRow({
  code,
  verdict,
  readOnly,
  onSet,
}: {
  code: string;
  verdict: Verdict | null;
  readOnly: boolean;
  onSet: (verdict: Verdict) => void;
}) {
  return (
    <View style={styles.row}>
      <CodeChip
        code={code}
        state={verdict === 'ok' ? 'ok' : verdict === 'damaged' ? 'damaged' : 'default'}
      />
      {readOnly ? null : (
        <View style={styles.toggles}>
          <VerdictButton
            icon="check"
            label={`${code} undamaged`}
            active={verdict === 'ok'}
            tone="ok"
            onPress={() => onSet('ok')}
          />
          <VerdictButton
            icon="x"
            label={`${code} damaged`}
            active={verdict === 'damaged'}
            tone="damaged"
            onPress={() => onSet('damaged')}
          />
        </View>
      )}
    </View>
  );
}

function VerdictButton({
  icon,
  label,
  active,
  tone,
  onPress,
}: {
  icon: 'check' | 'x';
  label: string;
  active: boolean;
  tone: 'ok' | 'damaged';
  onPress: () => void;
}) {
  const fg = tone === 'ok' ? colors.success : colors.danger;
  const bg = tone === 'ok' ? colors.successBg : colors.dangerBg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.toggle,
        active ? { backgroundColor: bg, borderColor: fg } : styles.toggleIdle,
      ]}
    >
      <Feather name={icon} size={16} color={active ? fg : colors.textMuted} />
    </Pressable>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
    paddingVertical: spacing.hair,
  },
  toggles: {
    flexDirection: 'row',
    gap: spacing.tight,
  },
  toggle: {
    width: 34,
    height: 34,
    borderRadius: radius.icon,
    borderWidth: layout.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIdle: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
  },
  footer: {
    padding: spacing.content,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
