import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, ColorSwatch, EmptyState, PhotoTile, TopBar } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { getSwatch } from '../../../data/swatches';
import type { DefectScope, DefectType } from '../../../data/types';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { InspectionStackParamList } from '../../../navigation/InspectionStack';
import { findFirstPendingUnit, getOrderUnits, returnUnit } from '../api';
import { DEFECT_TYPES, defectTypeLabel, useInspectionSession } from '../store';

type Props = NativeStackScreenProps<InspectionStackParamList, 'ReportDefect'>;

const SCOPES: { id: DefectScope; label: string; hint: string; icon: 'target' | 'layers' }[] = [
  {
    id: 'repeat',
    label: 'This Repeat Only',
    hint: 'Just the piece in front of you',
    icon: 'target',
  },
  {
    id: 'sheet',
    label: 'Whole Sheet',
    hint: 'Every repeat still pending on this sheet',
    icon: 'layers',
  },
];

export function ReportDefectScreen({ navigation, route }: Props) {
  const { orderId, unitId } = route.params;
  const insets = useSafeAreaInsets();
  const profile = useSession((state) => state.profile);
  const setLastAction = useInspectionSession((state) => state.setLastAction);

  const [defectType, setDefectType] = useState<DefectType | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scope, setScope] = useState<DefectScope | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => getOrderUnits(orderId), [orderId]);
  const { data, loading } = useQuery(fetcher);

  const unit = data?.units.find((candidate) => candidate.id === unitId);
  const canConfirm = Boolean(defectType && photoUri && scope);

  const confirm = async () => {
    if (!unit || !defectType || !photoUri || !scope || !profile) return;

    setWorking(true);
    setError(null);
    try {
      const returned = await returnUnit({
        factoryId: profile.factory_id,
        orderId,
        unitId: unit.id,
        orderSheetId: unit.orderSheetId,
        defectType,
        defectScope: scope,
        photoUri,
        inspectedBy: profile.id,
      });

      const label = defectTypeLabel(defectType);
      setLastAction({
        kind: 'returned',
        text:
          scope === 'sheet'
            ? `Whole sheet returned — ${returned} ${returned === 1 ? 'repeat' : 'repeats'} — ${label}`
            : `Repeat returned — ${label}`,
      });

      const next = await findFirstPendingUnit(orderId);
      if (next) {
        navigation.replace('Inspect', { orderId, unitId: next.id });
      } else {
        navigation.replace('Complete', { orderId });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={styles.screen}>
        <TopBar variant="bar" title="Report Defect" onPressBack={navigation.goBack} />
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </View>
    );
  }

  if (!unit) {
    return (
      <View style={styles.screen}>
        <TopBar variant="bar" title="Report Defect" onPressBack={navigation.goBack} />
        <EmptyState icon="alert-triangle" title="Could not load this repeat" />
      </View>
    );
  }

  const colorName = getSwatch(unit.colorId)?.label ?? unit.colorId;

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title="Report Defect"
        trailing={data?.orderCode}
        onPressBack={navigation.goBack}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <ColorSwatch
            colorId={unit.colorId}
            customHex={unit.customHex}
            size={28}
            interactive={false}
          />
          <Text style={type.bodyStrong}>{colorName}</Text>
          <Text style={type.label}>
            Repeat {unit.repeatIndexInSheet} of {unit.sheetRepeats}
          </Text>
        </View>

        <Card title="What is wrong?">
          <View style={styles.typeGrid}>
            {DEFECT_TYPES.map((entry) => {
              const selected = entry.id === defectType;
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setDefectType(entry.id)}
                  style={[styles.typeTile, selected && styles.typeTileSelected]}
                >
                  <Feather
                    name={entry.icon}
                    size={20}
                    color={selected ? colors.danger : colors.textSecondary}
                  />
                  <Text
                    style={[type.label, selected && styles.typeLabelSelected]}
                    numberOfLines={1}
                  >
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card title="Photograph the defect">
          {/* Captured fresh here, unlike the read-only intake photo on Inspect. */}
          <PhotoTile
            shape="wide"
            height={180}
            photoUri={photoUri}
            label={photoUri ? 'Photo added' : 'Tap to photograph the defect'}
            onCapture={setPhotoUri}
          />
        </Card>

        <Card title="How much goes back?">
          <View style={styles.scopeRow}>
            {SCOPES.map((entry) => {
              const selected = entry.id === scope;
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setScope(entry.id)}
                  style={[styles.scopeTile, selected && styles.scopeTileSelected]}
                >
                  <Feather
                    name={entry.icon}
                    size={20}
                    color={selected ? colors.danger : colors.textSecondary}
                  />
                  <Text style={[type.bodyStrong, selected && styles.typeLabelSelected]}>
                    {entry.label}
                  </Text>
                  <Text style={type.caption}>{entry.hint}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {error ? (
          <Card tone="danger">
            <Text style={[type.bodyStrong, styles.errorTitle]}>Could not save the return</Text>
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
          label="Confirm Return"
          tone="danger"
          flex
          disabled={!canConfirm}
          loading={working}
          onPress={confirm}
        />
      </View>
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
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight + 2,
  },
  typeTile: {
    // Two per row; the basis leaves room for the gap and flexGrow shares out
    // the remainder.
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    gap: spacing.hair + 2,
    paddingVertical: spacing.content - 2,
    paddingHorizontal: spacing.tight,
    borderRadius: radius.tile,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  typeTileSelected: {
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  typeLabelSelected: {
    color: colors.danger,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: spacing.tight + 2,
  },
  scopeTile: {
    flex: 1,
    gap: spacing.hair,
    padding: spacing.content - 4,
    borderRadius: radius.tile,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  scopeTileSelected: {
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
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
