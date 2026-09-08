import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  ColorSwatch,
  EmptyState,
  InfoRow,
  PhotoTile,
  SourceTag,
  TopBar,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { BUCKETS } from '../../../data/storage';
import { useQuery } from '../../../data/useQuery';
import { useSignedPhoto } from '../../../data/useSignedPhoto';
import { formatRs } from '../../../lib/ledgerMath';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import {
  confirmPurchaseOrder,
  getProcurementPo,
  lineQuantity,
  linesTotal,
  poLines,
  type PoLine,
} from '../../procurement/api';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'PODetail'>;

/**
 * Review a submitted bill and confirm it.
 *
 * Built for `status = 'submitted'` only. The stub stays in place for
 * `awaitingProcurement` and `awaitingConfirmation`: those two are genuinely
 * undesigned, and a detail screen invented for them would bake in decisions
 * nobody has made. This one has a spec because there is now something concrete
 * to review — prices, a supplier, and a photograph of the bill.
 *
 * It reads through the Procurement module's own row helpers rather than a
 * second copy of them. The two screens are looking at the same `po_items` rows,
 * and a store manager confirming a total that differs from the one procurement
 * submitted — because one screen summed it differently — is the exact failure
 * that a shared reader prevents.
 *
 * Confirming is what puts the PO on the Accountant's Payables tab; that tab
 * already filters on `confirmed` and needed no change.
 */
export function PODetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { purchaseOrderId } = route.params;

  const fetcher = useCallback(() => getProcurementPo(purchaseOrderId), [purchaseOrderId]);
  const { data, loading, error, refetch } = useQuery(fetcher);

  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const billPhoto = useSignedPhoto(BUCKETS.billPhotos, data?.bill_photo_url ?? null);

  const confirm = async () => {
    setConfirming(true);
    setFailure(null);
    try {
      await confirmPurchaseOrder(purchaseOrderId);
      refetch();
      navigation.goBack();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setConfirming(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={styles.screen}>
        <TopBar variant="bar" title="Purchase Order" onPressBack={navigation.goBack} />
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.screen}>
        <TopBar variant="bar" title="Purchase Order" onPressBack={navigation.goBack} />
        <EmptyState
          icon="alert-triangle"
          title="Could not load this purchase order"
          hint={error?.message}
        />
      </View>
    );
  }

  const lines = poLines(data);
  const total = linesTotal(lines);
  const confirmable = data.status === 'submitted';

  return (
    <View style={styles.screen}>
      <TopBar
        variant="bar"
        title="Purchase Order"
        onPressBack={navigation.goBack}
        trailing={data.po_number}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={type.title}>{data.po_number}</Text>
          <SourceTag label={data.source === 'manual' ? 'MANUAL' : 'SYSTEM-GENERATED'} />
        </View>

        <Card title="Items">
          {lines.map((line) => (
            <ItemLine key={line.id} line={line} />
          ))}
        </Card>

        <Card title="Bill">
          <InfoRow
            icon="truck"
            label="Actual Supplier"
            trailing={data.actual_supplier?.name ?? 'Not recorded'}
            divider
          />
          <InfoRow icon="dollar-sign" label="Total" trailing={formatRs(total)} divider />

          {data.bill_photo_url ? (
            <PhotoTile
              shape="wide"
              height={200}
              photoUri={billPhoto}
              variant="disabled"
              label="Bill photo"
              onCapture={() => {}}
            />
          ) : (
            <Text style={type.label}>No bill photo on this purchase order.</Text>
          )}
        </Card>

        {failure ? (
          <Card tone="danger">
            <Text style={[type.bodyStrong, styles.errorTitle]}>Could not confirm</Text>
            <Text style={type.body}>{failure}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.content) }]}>
        <Button
          label={confirmable ? 'Confirm Purchase Order' : 'Already Confirmed'}
          icon="check"
          flex
          disabled={!confirmable}
          loading={confirming}
          onPress={() => void confirm()}
        />
      </View>
    </View>
  );
}

/**
 * One line. An additional item wears the same amber label it wore on Fulfill —
 * the store manager is confirming a bill that includes things they never asked
 * for, and that distinction has to survive the handoff.
 */
function ItemLine({ line }: { line: PoLine }) {
  return (
    <View style={styles.row}>
      {line.colorId ? (
        <ColorSwatch colorId={line.colorId} customHex={line.hex} size={24} interactive={false} />
      ) : (
        <View
          style={[
            styles.plainSwatch,
            { backgroundColor: line.hex ?? colors.borderSubtle },
            !line.hex && styles.plainSwatchEmpty,
          ]}
        />
      )}

      <View style={styles.rowText}>
        {line.isAdditional ? (
          <View style={styles.addedTag}>
            <Text style={[type.pill, styles.addedTagLabel]}>Added by Procurement</Text>
          </View>
        ) : null}
        <Text style={type.body} numberOfLines={1}>
          {line.label}
        </Text>
        <Text style={type.caption}>{lineQuantity(line)}</Text>
      </View>

      <Text style={[type.code, styles.price]}>
        {line.price === null ? '—' : formatRs(line.price)}
      </Text>
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
    marginTop: spacing.content * 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingVertical: spacing.tight,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  plainSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  plainSwatchEmpty: {
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  addedTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.warningBg,
  },
  addedTagLabel: {
    color: colors.warning,
  },
  price: {
    fontSize: 15,
    color: colors.textPrimary,
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
