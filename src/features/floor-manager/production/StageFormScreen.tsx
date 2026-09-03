import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, ColorSwatch, EmptyState, StaticField, TopBar } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { getSwatch } from '../../../data/swatches';
import { STAGE_DEFS } from '../../../data/stageDefs';
import { WORKERS } from '../../../data/workers';
import { useQuery } from '../../../data/useQuery';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { getFloorOrder, patchSheet, stageQueue } from '../api';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'StageForm'>;

/**
 * Records who moved and who worked a sheet through one finishing stage.
 *
 * The two selections are the `stageFormDraft` — local to this screen, so they
 * cannot carry over to the next sheet or the next stage.
 */
export function StageFormScreen({ navigation, route }: Props) {
  const { orderId, sheetId } = route.params;
  const insets = useSafeAreaInsets();

  const [deliveryPerson, setDeliveryPerson] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => getFloorOrder(orderId), [orderId]);
  const { data: order, loading } = useQuery(fetcher);

  const sheet = order?.order_sheets.find((candidate) => candidate.id === sheetId);
  const queue = stageQueue(order?.stages ?? null);
  const stageKey = sheet ? queue[sheet.stage_index ?? 0] : undefined;
  const stageDef = stageKey ? STAGE_DEFS[stageKey] : undefined;

  const canConfirm = Boolean(deliveryPerson && workerName && stageKey && sheet);

  const confirm = async () => {
    if (!sheet || !stageKey || !deliveryPerson || !workerName) return;

    setWorking(true);
    setError(null);
    try {
      await patchSheet(sheet.id, {
        stage: 'stageFormDone',
        stage_records: [
          ...(sheet.stage_records ?? []),
          { key: stageKey, delivery_person: deliveryPerson, worker_name: workerName },
        ],
      });
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
        title={stageDef?.label ?? 'Stage'}
        trailing={order?.job_card_code ?? order?.code}
        onPressBack={navigation.goBack}
      />

      {loading && !order ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : !sheet || !stageDef ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load this stage"
          hint="The sheet may have moved on already."
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <View style={styles.summary}>
                <ColorSwatch
                  colorId={sheet.color_id}
                  customHex={sheet.custom_hex}
                  size={28}
                  interactive={false}
                />
                <Text style={type.bodyStrong}>
                  {getSwatch(sheet.color_id)?.label ?? sheet.color_id}
                </Text>
                <Text style={type.label}>
                  {sheet.repeats} {sheet.repeats === 1 ? 'repeat' : 'repeats'}
                </Text>
              </View>
              <StaticField
                icon="clipboard"
                label="Job Card"
                value={order?.job_card_code ?? '—'}
              />
            </Card>

            <Card title="Delivery Person">
              <ChipRow value={deliveryPerson} onChange={setDeliveryPerson} />
            </Card>

            <Card title={stageDef.workerLabel}>
              <ChipRow value={workerName} onChange={setWorkerName} />
            </Card>

            {error ? (
              <Card tone="danger">
                <Text style={[type.bodyStrong, styles.errorTitle]}>Could not save</Text>
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
              label="Confirm"
              flex
              disabled={!canConfirm}
              loading={working}
              onPress={confirm}
            />
          </View>
        </>
      )}
    </View>
  );
}

/** Single-select chips over the hard-coded worker list. */
function ChipRow({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (name: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {WORKERS.map((name) => {
        const selected = name === value;
        return (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(name)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[type.pill, selected && styles.chipLabelSelected]}>{name}</Text>
          </Pressable>
        );
      })}
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight - 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.neutralAccent,
  },
  chipLabelSelected: {
    color: colors.primary,
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
