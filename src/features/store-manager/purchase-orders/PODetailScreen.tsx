import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, InfoRow, PhotoTile } from '../../../components';
import { type } from '../../../theme';
import { BUCKETS } from '../../../data/storage';
import { useQuery } from '../../../data/useQuery';
import { useSignedPhoto } from '../../../data/useSignedPhoto';
import type { StoreManagerStackParamList } from '../../../navigation/StoreManagerStack';
import { confirmPurchaseOrder } from '../../procurement/api';
import {
  TYPE_META,
  fmt,
  getPurchaseOrder,
  isShortYards,
  isoDay,
  poBucket,
  poItemType,
  poTotal,
  unitsLabel,
} from '../api';
import { DetailShell, ErrorCard, MaterialLine, Note, TotalCard } from '../components';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'PODetail'>;

/**
 * One purchase order in any of its three buckets.
 *
 * Only the "Awaiting Confirmation" bucket has an action, and it is the one that
 * matters: confirming receipt credits every line into a lot keyed by the
 * supplier actually bought from (`confirm_purchase_order`, 0018). It is also
 * what puts the PO on the Accountant's Payables tab.
 */
export function PODetailScreen({ navigation, route }: Props) {
  const { purchaseOrderId } = route.params;
  const fetcher = useCallback(() => getPurchaseOrder(purchaseOrderId), [purchaseOrderId]);
  const { data: po, loading, error } = useQuery(fetcher);
  const billPhoto = useSignedPhoto(BUCKETS.billPhotos, po?.bill_photo_url ?? null);

  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!po) {
    return <DetailShell title="Purchase Order" onBack={navigation.goBack} loading={loading} error={error} />;
  }

  const bucket = poBucket(po.status);
  const supplier = po.actual_supplier?.name ?? po.supplier_name;
  const recommend = po.po_items.find((i) => i.recommended_supplier)?.recommended_supplier?.name;
  const anyShort = po.po_items.some(isShortYards);
  const total = poTotal(po);

  const confirm = async () => {
    setConfirming(true);
    setFailure(null);
    try {
      await confirmPurchaseOrder(po.id);
      navigation.goBack();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <DetailShell
      title={po.po_number}
      trailing={po.source === 'manual' ? 'Manual' : 'System-Generated'}
      onBack={navigation.goBack}
      footer={
        bucket === 'awaitingConfirmation' ? (
          <Button
            label="Confirm Receipt — adds stock"
            icon="check"
            flex
            loading={confirming}
            onPress={() => void confirm()}
          />
        ) : undefined
      }
    >
      <Card>
        <InfoRow
          icon="truck"
          label={supplier ?? recommend ?? 'No supplier yet'}
          subLabel={supplier ? 'Supplier actually bought from' : 'Recommended by you — procurement decides'}
          divider
        />
        {po.submitted_at ? (
          <InfoRow
            icon="user"
            label={`Fulfilled by ${po.submitter?.full_name ?? 'Procurement'} (Procurement)`}
            subLabel={`${isoDay(po.submitted_at)} · bill photographed`}
            divider
          />
        ) : null}
        <InfoRow
          icon="calendar"
          label={`Raised ${isoDay(po.date)}`}
          subLabel={`${po.po_items.length} item${po.po_items.length === 1 ? '' : 's'}`}
        />
      </Card>

      {anyShort ? (
        <Note tone="warn" text="A line came in short on yards per unit. The unit count matches; the length does not." />
      ) : null}

      <Card title={bucket === 'awaitingProcurement' ? 'Items requested' : 'Items received'}>
        {po.po_items.map((item) => {
          const itemType = poItemType(item);
          const meta = TYPE_META[itemType];
          const short = isShortYards(item);
          const sub = item.is_additional
            ? 'Added by Procurement'
            : meta.hasYards
              ? `Asked ${fmt(item.ask_yards ?? 0)} yd${item.got_yards !== null ? ` · Got ${fmt(item.got_yards)} yd` : ''}`
              : 'No length measure';
          return (
            <MaterialLine
              key={item.id}
              code={item.stock_items?.code ?? 'NEW'}
              title={unitsLabel(itemType, item.qty)}
              sub={sub}
              value={item.price ? `Rs. ${fmt(item.price)}` : '—'}
              status={
                short
                  ? `Short ${fmt((item.ask_yards ?? 0) - (item.got_yards ?? 0))} yd/${meta.unit}`
                  : item.is_additional
                    ? 'Extra'
                    : bucket === 'awaitingProcurement'
                      ? 'Requested'
                      : 'Full'
              }
              statusTone={short ? 'warn' : 'good'}
            />
          );
        })}
      </Card>

      {total ? <TotalCard label="Bill total" value={`Rs. ${fmt(total)}`} /> : null}

      {po.bill_photo_url ? (
        <PhotoTile
          shape="wide"
          height={200}
          photoUri={billPhoto}
          variant="disabled"
          label="Bill photo"
          onCapture={() => {}}
        />
      ) : null}

      {bucket === 'confirmed' ? (
        <Note
          tone="good"
          text={`Confirmed ${isoDay(po.confirmed_at)}. Each line created or added to a lot keyed by ${supplier ?? 'the supplier'}, carrying its invoiced price and actual unit length.`}
        />
      ) : null}
      {bucket === 'awaitingProcurement' ? (
        <Note
          tone="plain"
          text="Waiting on procurement to buy and upload the bill. Your supplier pick is a suggestion, not a decision."
        />
      ) : null}
      {bucket === 'awaitingConfirmation' ? (
        <Text style={type.caption}>Stock only moves when you confirm receipt.</Text>
      ) : null}

      {failure ? <ErrorCard title="Could not confirm" message={failure} /> : null}
    </DetailShell>
  );
}
