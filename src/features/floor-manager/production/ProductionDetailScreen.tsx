import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  EmptyState,
  InfoRow,
  InvoiceRow,
  NoteCard,
  NumericKeypadSheet,
  SheetRow,
  StaticField,
  TopBar,
} from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import type { SheetStage } from '../../../data/types';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import {
  allSheetsReady,
  computeInvoice,
  getFloorOrder,
  getHandledBy,
  patchSheet,
  repeatCodes,
  setDamagedRepeatsPrice,
  sortedSheets,
  stageQueue,
  startProduction,
} from '../api';
import { advanceSheet, describeSheetPhase } from '../stageMachine';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'ProductionDetail'>;

export function ProductionDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const profile = useSession((state) => state.profile);

  const [busySheetId, setBusySheetId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    const order = await getFloorOrder(orderId);
    const inspectionManager = await getHandledBy(orderId);
    return { order, inspectionManager };
  }, [orderId]);

  const { data, loading, refetch } = useQuery(fetcher);

  const order = data?.order;
  const queue = stageQueue(order?.stages ?? null);
  const sheets = order ? sortedSheets(order) : [];
  const ready = order ? allSheetsReady(order) : false;
  const invoice = order ? computeInvoice(order) : null;

  const run = async (work: () => Promise<void>) => {
    setError(null);
    try {
      await work();
      refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const begin = async () => {
    if (!order) return;
    setStarting(true);
    await run(() => startProduction(order));
    setStarting(false);
  };

  const onSheetAction = async (
    sheetId: string,
    stage: SheetStage | null,
    index: number,
  ) => {
    const phase = describeSheetPhase(stage, index, queue);

    // `readyForStage` is the one phase whose button opens a form rather than
    // moving the sheet on directly.
    if (phase.opensStageForm) {
      navigation.navigate('StageForm', { orderId, sheetId });
      return;
    }

    const next = advanceSheet(stage, index, queue);
    if (!next) return;

    setBusySheetId(sheetId);
    await run(() => patchSheet(sheetId, next));
    setBusySheetId(null);
  };

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title="Production"
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
              <StaticField
                icon="clipboard"
                label="Job Card"
                value={order.job_card_code ?? '—'}
              />
              <StaticField icon="user" label="Client" value={order.clients?.name ?? '—'} />
            </Card>

            <Card title="Sheets">
              {sheets.map((sheet, index) => {
                const stageIndex = sheet.stage_index ?? 0;
                const phase = describeSheetPhase(sheet.stage, stageIndex, queue);

                return (
                  <SheetRow
                    key={sheet.id}
                    colorId={sheet.color_id}
                    customHex={sheet.custom_hex}
                    repeats={sheet.repeats}
                    repeatCodes={repeatCodes(order.code, index, sheet.repeats)}
                    phaseLabel={phase.label}
                    phaseTone={phase.tone}
                    actionLabel={phase.actionLabel}
                    actionBusy={busySheetId === sheet.id}
                    onPressAction={
                      phase.actionLabel
                        ? () => void onSheetAction(sheet.id, sheet.stage, stageIndex)
                        : undefined
                    }
                  />
                );
              })}
            </Card>

            {ready ? (
              <>
                <Card title="Handled By">
                  <InfoRow
                    icon="user-check"
                    label="Floor Manager"
                    subLabel={profile?.full_name ?? '—'}
                    divider
                  />
                  <InfoRow
                    icon="search"
                    label="Inspection Manager"
                    subLabel={data?.inspectionManager ?? '—'}
                    tone="success"
                  />
                </Card>

                <Card title="Invoice">
                  {invoice ? (
                    <>
                      <InvoiceRow
                        label="Total repeats"
                        value={String(invoice.totalRepeats)}
                      />
                      <InvoiceRow
                        label="Stitches per repeat"
                        value={invoice.perRepeatStitches.toLocaleString()}
                      />
                      <InvoiceRow
                        label="Total bill"
                        value={invoice.totalBill.toLocaleString()}
                      />
                      <InvoiceRow
                        label="Damaged repeats"
                        value={invoice.damaged.toLocaleString()}
                        editable
                        onPress={() => setEditingPrice(true)}
                      />
                      <InvoiceRow
                        label="Remaining receivable"
                        value={invoice.remainingReceivable.toLocaleString()}
                        total
                      />
                    </>
                  ) : (
                    <NoteCard text="No billing mode or rate is set on this order, so the invoice cannot be calculated. Billing is read-only in this module." />
                  )}
                </Card>
              </>
            ) : null}

            {error ? (
              <Card tone="danger">
                <Text style={[type.bodyStrong, styles.errorTitle]}>Could not save</Text>
                <Text style={type.body}>{error}</Text>
              </Card>
            ) : null}
          </ScrollView>

          {order.floor_status === 'productionAwaiting' ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, spacing.content) },
              ]}
            >
              <Button
                label="Start Production"
                flex
                loading={starting}
                onPress={begin}
              />
            </View>
          ) : null}

          <NumericKeypadSheet
            visible={editingPrice}
            title="Damaged repeats price"
            initialValue={String(order.damaged_repeats_price ?? '')}
            placeholder="Enter amount"
            maxLength={9}
            minLength={1}
            format={(digits) => Number(digits).toLocaleString()}
            onSubmit={(digits) => {
              setEditingPrice(false);
              void run(() => setDamagedRepeatsPrice(orderId, Number(digits)));
            }}
            onClose={() => setEditingPrice(false)}
          />
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
