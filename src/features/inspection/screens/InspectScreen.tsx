import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, ColorSwatch, EmptyState, TopBar } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { BUCKETS } from '../../../data/storage';
import { getSwatch } from '../../../data/swatches';
import { useQuery } from '../../../data/useQuery';
import { useSignedPhoto } from '../../../data/useSignedPhoto';
import { useSession } from '../../../state/session';
import type { InspectionStackParamList } from '../../../navigation/InspectionStack';
import { findFirstPendingUnit, getOrderUnits, passUnit } from '../api';
import { useInspectionSession } from '../store';

type Props = NativeStackScreenProps<InspectionStackParamList, 'Inspect'>;

export function InspectScreen({ navigation, route }: Props) {
  const { orderId, unitId } = route.params;
  const insets = useSafeAreaInsets();
  const profileId = useSession((state) => state.profile?.id);
  const lastAction = useInspectionSession((state) => state.lastAction);
  const setLastAction = useInspectionSession((state) => state.setLastAction);
  const [working, setWorking] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  const fetcher = useCallback(() => getOrderUnits(orderId), [orderId]);
  const { data, loading, error } = useQuery(fetcher);

  const unit = data?.units.find((candidate) => candidate.id === unitId);
  // One order-level photo, shown against every unit — Order Taker v2 replaced
  // the per-sheet proof photo with a single shot of the whole order.
  const proofPhoto = useSignedPhoto(BUCKETS.sheetProofPhotos, data?.proofPhotoPath);

  const pass = async () => {
    if (!data || !unit || !profileId) return;

    setWorking(true);
    setPassError(null);
    try {
      const code = await passUnit({
        unitId: unit.id,
        orderCode: data.orderCode,
        position: unit.position,
        inspectedBy: profileId,
      });
      setLastAction({ kind: 'passed', text: `Repeat passed — code ${code}` });

      const next = await findFirstPendingUnit(orderId);
      if (next) {
        // Replace, not push: a twelve-repeat order must not leave twelve
        // screens on the back stack.
        navigation.replace('Inspect', { orderId, unitId: next.id });
      } else {
        navigation.replace('Complete', { orderId });
      }
    } catch (caught) {
      // The unit is untouched on failure, so the same decision can be made
      // again — keep the QA person on this repeat rather than advancing.
      setPassError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={styles.screen}>
        <TopBar variant="bar" title="Inspect" onPressBack={navigation.goBack} />
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </View>
    );
  }

  if (error || !data || !unit) {
    return (
      <View style={styles.screen}>
        <TopBar variant="bar" title="Inspect" onPressBack={navigation.goBack} />
        <EmptyState
          icon="alert-triangle"
          title="Could not load this repeat"
          hint={error?.message ?? 'It may already have been inspected.'}
        />
      </View>
    );
  }

  const swatch = getSwatch(unit.colorId);
  const colorName = swatch?.label ?? unit.colorId;

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title={`Repeat ${unit.position} of ${data.total}`}
        trailing={data.orderCode}
        onPressBack={navigation.goBack}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips}>
          <Chip
            label="Pending"
            count={data.pending}
            fg={colors.textSecondary}
            bg={colors.draftBg}
          />
          <Chip
            label="Passed"
            count={data.passed}
            fg={colors.success}
            bg={colors.successBg}
          />
          {/* Only appears once something on this order has actually been
              returned — an empty red chip on every order reads as an alarm. */}
          {data.returned > 0 ? (
            <Chip
              label="Returned"
              count={data.returned}
              fg={colors.danger}
              bg={colors.dangerBg}
            />
          ) : null}
        </View>

        {lastAction ? (
          <View
            style={[
              styles.banner,
              lastAction.kind === 'passed' ? styles.bannerPass : styles.bannerReturn,
            ]}
          >
            <Feather
              name={lastAction.kind === 'passed' ? 'check-circle' : 'corner-up-left'}
              size={16}
              color={lastAction.kind === 'passed' ? colors.success : colors.danger}
            />
            <Text
              style={[
                type.label,
                { color: lastAction.kind === 'passed' ? colors.success : colors.danger },
              ]}
            >
              {lastAction.text}
            </Text>
          </View>
        ) : null}

        <Card>
          <View style={styles.colorRow}>
            <ColorSwatch
              colorId={unit.colorId}
              customHex={unit.customHex}
              size={72}
              interactive={false}
            />
            <View style={styles.colorText}>
              <Text style={type.title}>{colorName}</Text>
              <Text style={type.label}>
                Repeat {unit.repeatIndexInSheet} of {unit.sheetRepeats} — this color
              </Text>
            </View>
          </View>
        </Card>

        {passError ? (
          <Card tone="danger">
            <Text style={[type.bodyStrong, styles.errorTitle]}>Could not pass this repeat</Text>
            <Text style={type.body}>{passError}</Text>
          </Card>
        ) : null}

        <Card title="Proof photo from intake">
          {proofPhoto ? (
            <Image source={{ uri: proofPhoto }} style={styles.proofPhoto} />
          ) : (
            <View style={[styles.proofPhoto, styles.proofPlaceholder]}>
              <Feather
                name={data.proofPhotoPath ? 'loader' : 'image'}
                size={20}
                color={colors.textMuted}
              />
              <Text style={type.caption}>
                {data.proofPhotoPath ? 'Loading photo…' : 'No proof photo on this order'}
              </Text>
            </View>
          )}
          <Text style={type.caption}>
            One photo covers the whole order — the same image shows on every repeat.
          </Text>
        </Card>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.content) },
        ]}
      >
        <Button
          label="Defect"
          tone="danger"
          icon="alert-triangle"
          flex
          disabled={working}
          onPress={() => navigation.navigate('ReportDefect', { orderId, unitId })}
        />
        <Button
          label="Pass"
          icon="check"
          flex
          loading={working}
          onPress={pass}
          style={styles.passButton}
        />
      </View>
    </View>
  );
}

function Chip({
  label,
  count,
  fg,
  bg,
}: {
  label: string;
  count: number;
  fg: string;
  bg: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[type.pill, { color: fg }]}>{label}</Text>
      <Text style={[type.pill, styles.chipCount, { color: fg }]}>{count}</Text>
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
  chips: {
    flexDirection: 'row',
    gap: spacing.tight,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.hair + 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipCount: {
    fontFamily: type.code.fontFamily,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    padding: spacing.tight + 2,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
  },
  bannerPass: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
  },
  bannerReturn: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.content,
  },
  colorText: {
    flex: 1,
  },
  proofPhoto: {
    width: '100%',
    height: 180,
    borderRadius: radius.tile,
    resizeMode: 'cover',
    backgroundColor: colors.bg,
  },
  proofPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.hair,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.tight + 2,
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
  passButton: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  errorTitle: {
    color: colors.danger,
  },
});
