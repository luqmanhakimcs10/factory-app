import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, CodeChip, NoteCard, PhotoTile, StaticField } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { notify } from '../../../lib/alert';
import { useSession } from '../../../state/session';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { getFloorOrder } from '../api';
import {
  checkStitchTotal,
  colorLabel,
  extractDesignSheet,
  formatSize,
  type DesignSheetExtraction,
} from '../designSheet';
import { JobCardLayout } from './JobCardLayout';
import { useJobCard } from './jobCardStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'JobCardDesignSheet'>;

/**
 * Step 1 of the job card: photograph the client's design sheet, and read it.
 *
 * This screen's subtext has always promised to "load stitch and colour details"
 * from the photo. Until now it loaded nothing — the photo sat on the draft, was
 * never written anywhere, and the floor manager retyped every stitch count on
 * the next screen off the paper still in their hand. Reading it is what that
 * sentence meant.
 *
 * Extraction is a separate tap from the capture, not an automatic consequence of
 * it. A blurry first shot is normal and each read costs a model call, so the
 * floor manager gets to look at the photo before spending one — and can move on
 * without extracting at all, which is what happens when a client brings no sheet.
 */
export function DesignSheetScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const photoUri = useJobCard((state) => state.designSheetPhotoUri);
  const setPhotoUri = useJobCard((state) => state.setDesignSheetPhotoUri);
  const extraction = useJobCard((state) => state.extraction);
  const setExtraction = useJobCard((state) => state.setExtraction);

  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => getFloorOrder(orderId), [orderId]);
  const { data: order } = useQuery(fetcher);

  const capture = (uri: string) => {
    setPhotoUri(uri);
    // A new photo invalidates the old read. Keeping it would leave the screen
    // showing colours from a sheet that is no longer on screen.
    if (extraction) setExtraction(null);
  };

  const read = async () => {
    if (!photoUri || !factoryId) return;
    setBusy(true);
    try {
      const { extraction: result, saved } = await extractDesignSheet(
        factoryId,
        orderId,
        photoUri,
      );
      setExtraction(result);
      if (!saved) {
        notify(
          'Read, but not saved',
          'The details below are loaded for this job card. They could not be written to the order, so re-opening it later will need another read.',
        );
      }
    } catch (caught) {
      notify(
        'Could not read the sheet',
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <JobCardLayout
      title="Job Card"
      step={1}
      trailing={order?.code}
      onBack={navigation.goBack}
      heading="Design sheet"
      subtext="Photograph the client's design sheet to load stitch and colour details."
      footer={
        <>
          <Button label="Back" tone="secondary" flex onPress={navigation.goBack} />
          <Button
            label="Next"
            flex
            disabled={!photoUri}
            onPress={() => navigation.navigate('JobCardDetails', { orderId })}
          />
        </>
      }
    >
      <View style={styles.fields}>
        <StaticField icon="hash" label="Order" value={order?.code ?? '—'} />
        <StaticField icon="user" label="Client" value={order?.clients?.name ?? '—'} />
      </View>

      <Card>
        <PhotoTile
          shape="wide"
          height={200}
          photoUri={photoUri}
          label={photoUri ? 'Photo added' : 'Tap to photograph the design sheet'}
          onCapture={capture}
        />
        {photoUri && !extraction ? (
          <Button
            label={busy ? 'Reading the sheet…' : 'Read details from photo'}
            icon="cpu"
            tone="outline"
            loading={busy}
            onPress={read}
          />
        ) : null}
        <Text style={type.caption}>
          {extraction
            ? 'Read from the photo. Every value is checked on the next screen before it reaches the job card.'
            : 'Stored with the order, so a re-read never needs the sheet back.'}
        </Text>
      </Card>

      {busy && !extraction ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
          <Text style={type.label}>Reading colours and stitch counts…</Text>
        </View>
      ) : null}

      {extraction ? <ExtractionSummary extraction={extraction} onRetry={read} busy={busy} /> : null}
    </JobCardLayout>
  );
}

/**
 * What the sheet was read as, before any of it is applied.
 *
 * Shown here rather than only on the needles screen so a bad read is caught
 * while the paper is still out and re-photographing costs nothing. The stitch
 * total is the check worth reading first: a misread digit in one colour is
 * invisible on its own line and obvious in the sum.
 */
function ExtractionSummary({
  extraction,
  onRetry,
  busy,
}: {
  extraction: DesignSheetExtraction;
  onRetry: () => void;
  busy: boolean;
}) {
  const check = checkStitchTotal(extraction);
  const size = formatSize(extraction);

  return (
    <Card title="Read from the sheet">
      {extraction.confidence !== 'high' ? (
        <NoteCard
          title={extraction.confidence === 'low' ? 'Hard to read' : 'Partly unclear'}
          text={
            extraction.notes ??
            'Some of this sheet was difficult to make out. Check the numbers against the paper.'
          }
        />
      ) : null}

      {extraction.design_code || extraction.design_name ? (
        <StaticField
          icon="hash"
          label="Client's design"
          value={
            [extraction.design_name, extraction.design_code].filter(Boolean).join(' · ') || '—'
          }
        />
      ) : null}

      {size ? <StaticField icon="maximize-2" label="Size" value={size} /> : null}

      {extraction.colors.length === 0 ? (
        <Text style={type.label}>
          No colour sequence was found on this sheet. The needle rows on the next screen start
          empty, as they always have.
        </Text>
      ) : (
        extraction.colors.map((color) => (
          <View key={`${color.sequence}-${color.name}`} style={styles.colorRow}>
            <CodeChip code={String(color.sequence)} />
            <View style={styles.colorText}>
              <Text style={type.bodyStrong} numberOfLines={1}>
                {colorLabel(color)}
              </Text>
              {color.thread_code ? (
                <Text style={type.caption} numberOfLines={1}>
                  {color.thread_code}
                </Text>
              ) : null}
            </View>
            <Text style={[type.code, styles.stitches]}>
              {color.stitches === null ? '—' : color.stitches.toLocaleString()}
            </Text>
          </View>
        ))
      )}

      {check.total !== null ? (
        <View style={[styles.totalRow, check.mismatch && styles.totalRowBad]}>
          <Feather
            name={check.mismatch ? 'alert-triangle' : 'check'}
            size={16}
            color={check.mismatch ? colors.danger : colors.success}
          />
          <Text style={[type.label, check.mismatch && styles.badText]}>
            {check.mismatch
              ? `Colours add up to ${check.sum.toLocaleString()}, sheet says ${check.total.toLocaleString()}`
              : `Colours add up to the sheet's total of ${check.total.toLocaleString()}`}
          </Text>
        </View>
      ) : null}

      <Button
        label="Read again"
        icon="refresh-cw"
        tone="ghost"
        loading={busy}
        onPress={onRetry}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.tight,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    paddingVertical: spacing.tight,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  colorText: {
    flex: 1,
    gap: 2,
  },
  stitches: {
    color: colors.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    padding: spacing.tight,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.success,
    backgroundColor: colors.successBg,
  },
  totalRowBad: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  badText: {
    color: colors.danger,
  },
});
