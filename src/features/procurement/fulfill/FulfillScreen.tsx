import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import {
  Button,
  Card,
  ColorSwatch,
  EmptyState,
  NoteCard,
  NumericKeypadSheet,
  PhotoTile,
  PriceTap,
  StaticField,
  TopBar,
} from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { SWATCHES } from '../../../data/swatches';
import { TILLA_SHADES, TILLA_LABELS, TILLA_SWATCHES } from '../../../data/tillaSwatches';
import { BUCKETS } from '../../../data/storage';
import { useQuery } from '../../../data/useQuery';
import { useSignedPhoto } from '../../../data/useSignedPhoto';
import type { StockType } from '../../../data/types';
import { formatRs } from '../../../lib/ledgerMath';
import { QUANTITY_UNITS, formatQuantity } from '../../../lib/quantityFormat';
import { useSession } from '../../../state/session';
import { listSuppliers } from '../../company-admin/rosters';
import type { ProcurementStackParamList } from '../../../navigation/ProcurementStack';
import {
  getProcurementPo,
  lineLabel,
  lineQuantity,
  poLines,
  submitProcurementBill,
  type PoLine,
} from '../api';
import { canAddItem, useFulfillDraft } from '../draftStore';

type Props = NativeStackScreenProps<ProcurementStackParamList, 'Fulfill'>;

const ITEM_TYPES: { value: StockType; label: string }[] = [
  { value: 'thread', label: 'Thread' },
  { value: 'tilla', label: 'Tilla' },
  { value: 'sequin', label: 'Sequin' },
  { value: 'bobbin', label: 'Bobbin' },
];

const SEQUIN_SIZES = [2, 3, 4, 5, 6];
const SEQUIN_CUTS = ['Cut', 'Flat', 'Cup'];

/** Which control the numeric keypad is currently standing in for. */
type KeypadTarget =
  | { kind: 'itemPrice'; itemId: string; label: string }
  | { kind: 'addQty' }
  | { kind: 'addPrice' };

/**
 * Price a manual purchase order and submit it as a bill.
 *
 * **One screen, two modes.** `readOnly` renders an already-submitted bill: the
 * same layout, every control inert, the footer a way back instead of a submit.
 * A separate read-only copy would be a second screen to keep in step with this
 * one, and the thing most worth showing a store manager's colleague is exactly
 * what was submitted — not a reconstruction of it.
 *
 * **Nothing is written until Submit.** Prices live in `useFulfillDraft` and go
 * to the database in the single `submit_procurement_bill` transaction. A
 * half-priced PO written per-tap would be in no state any screen queries for.
 *
 * **The supplier is never pre-selected**, even when every requested line shares
 * one recommendation. The recommendation is where the store manager expected it
 * to be bought; the chip row is where it actually was. Defaulting one to the
 * other is how a bill ends up filed against a supplier nobody visited.
 */
export function FulfillScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { purchaseOrderId, readOnly } = route.params;
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetchPo = useCallback(() => getProcurementPo(purchaseOrderId), [purchaseOrderId]);
  const po = useQuery(fetchPo);

  const fetchSuppliers = useCallback(() => listSuppliers(factoryId as string), [factoryId]);
  const suppliers = useQuery(fetchSuppliers, Boolean(factoryId));

  const draft = useFulfillDraft();
  const openDraft = useFulfillDraft((state) => state.open);
  const [keypad, setKeypad] = useState<KeypadTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-item sub-draft. Local rather than in the store: it is scratch space
  // that only ever becomes real by being pushed into `draft.additional`.
  const [addType, setAddType] = useState<StockType | null>(null);
  const [addColor, setAddColor] = useState<string | null>(null);
  const [addSize, setAddSize] = useState<number | null>(null);
  const [addCut, setAddCut] = useState<string | null>(null);
  const [addQty, setAddQty] = useState<number | null>(null);
  const [addPrice, setAddPrice] = useState<number | null>(null);

  // Point the draft at this PO. Skipped entirely in read-only mode: opening a
  // submitted bill is a lookup, and it must not discard a half-priced draft the
  // person still has in progress on a different PO.
  useEffect(() => {
    if (!readOnly) openDraft(purchaseOrderId);
  }, [openDraft, purchaseOrderId, readOnly]);

  const resetSubDraft = (next: StockType) => {
    // Changing type invalidates every field below it — a 3mm cut is meaningless
    // on thread, and a leftover colour would silently ride along into the row.
    setAddType(next);
    setAddColor(null);
    setAddSize(null);
    setAddCut(null);
    setAddQty(null);
    setAddPrice(null);
  };

  if (po.loading && !po.data) {
    return (
      <View style={styles.screen}>
        <TopBar variant="bar" title="Fulfill PO" onPressBack={navigation.goBack} />
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </View>
    );
  }

  if (po.error || !po.data) {
    return (
      <View style={styles.screen}>
        <TopBar variant="bar" title="Fulfill PO" onPressBack={navigation.goBack} />
        <EmptyState
          icon="alert-triangle"
          title="Could not load this purchase order"
          hint={po.error?.message}
        />
      </View>
    );
  }

  const order = po.data;
  const lines = poLines(order);
  const requested = lines.filter((line) => !line.isAdditional);
  const savedAdditional = lines.filter((line) => line.isAdditional);

  // In read-only mode everything comes off the row; while editing, the
  // requested lines come off the draft and the additional ones out of it.
  const priceOf = (line: PoLine): number | null =>
    readOnly ? line.price : (draft.prices[line.id] ?? null);

  const activeAdditional = readOnly
    ? savedAdditional.map((line) => ({
        key: line.id,
        label: line.label,
        qty: line.qty,
        price: line.price ?? 0,
        itemType: line.type,
        sizeMm: line.sizeMm,
      }))
    : draft.additional.map((item) => ({
        key: item.key,
        label: lineLabel(item.itemType, item.colorId, item.sequinSizeMm, item.sequinCutType),
        qty: item.qty,
        price: item.price,
        itemType: item.itemType,
        sizeMm: item.sequinSizeMm,
      }));

  const total =
    requested.reduce((sum, line) => sum + (priceOf(line) ?? 0), 0) +
    activeAdditional.reduce((sum, item) => sum + item.price, 0);

  const everyItemPriced =
    requested.length > 0 && requested.every((line) => (priceOf(line) ?? 0) > 0);
  const canSubmit =
    !readOnly && everyItemPriced && draft.supplierId !== null && draft.photoUri !== null;

  const activeSuppliers = (suppliers.data ?? []).filter(
    (supplier) => supplier.status === 'active',
  );

  const submit = async () => {
    if (!canSubmit || !factoryId || !draft.supplierId || !draft.photoUri) return;

    setSubmitting(true);
    setError(null);
    try {
      await submitProcurementBill({
        factoryId,
        purchaseOrderId,
        actualSupplierId: draft.supplierId,
        billPhotoUri: draft.photoUri,
        itemPrices: requested.map((line) => ({
          id: line.id,
          price: draft.prices[line.id] as number,
        })),
        additionalItems: draft.additional.map(({ key: _key, ...item }) => item),
      });

      const supplierName =
        activeSuppliers.find((supplier) => supplier.id === draft.supplierId)?.name ?? '';

      navigation.replace('Submitted', {
        poNumber: order.po_number,
        supplierName,
        total,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <View style={styles.screen}>
        <TopBar
          variant="bar"
          title={readOnly ? 'Submitted Bill' : 'Fulfill PO'}
          onPressBack={navigation.goBack}
          trailing={order.po_number}
        />

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <StaticField
            icon="file-text"
            label="Purchase Order"
            value={`${order.po_number} · ${new Date(order.date).toLocaleDateString()} · Manual Request`}
          />

          {readOnly ? (
            <View style={styles.submittedNote}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={[type.body, styles.submittedNoteText]}>
                Bill submitted — awaiting store manager confirmation.
              </Text>
            </View>
          ) : null}

          <Card title="Items Requested — Enter Bill Price">
            {requested.length === 0 ? (
              <EmptyState icon="inbox" title="This purchase order has no items" />
            ) : (
              requested.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  price={priceOf(line)}
                  disabled={readOnly}
                  onPress={() =>
                    setKeypad({ kind: 'itemPrice', itemId: line.id, label: line.label })
                  }
                />
              ))
            )}
          </Card>

          <SupplierPicker
            suppliers={activeSuppliers}
            loading={suppliers.loading}
            selectedId={readOnly ? (order.actual_supplier?.id ?? null) : draft.supplierId}
            disabled={readOnly}
            onSelect={draft.setSupplier}
          />

          <BillPhoto
            localUri={readOnly ? null : draft.photoUri}
            storedPath={readOnly ? order.bill_photo_url : null}
            disabled={readOnly}
            onCapture={draft.setPhoto}
          />

          {activeAdditional.length > 0 ? (
            <Card title="Additional Items Bought">
              {activeAdditional.map((item) => (
                <View key={item.key} style={styles.additionalRow}>
                  <View style={styles.additionalText}>
                    <View style={styles.addedTag}>
                      <Text style={[type.pill, styles.addedTagLabel]}>
                        Added by Procurement
                      </Text>
                    </View>
                    <Text style={type.bodyStrong} numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text style={type.caption}>
                      {formatQuantity(item.itemType, item.qty, item.sizeMm)}
                    </Text>
                  </View>
                  <Text style={[type.code, styles.additionalPrice]}>
                    {formatRs(item.price)}
                  </Text>
                  {readOnly ? null : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.label}`}
                      hitSlop={8}
                      onPress={() => draft.removeAdditional(item.key)}
                    >
                      <Feather name="x-circle" size={20} color={colors.danger} />
                    </Pressable>
                  )}
                </View>
              ))}
            </Card>
          ) : null}

          {readOnly ? null : (
            <Card title="Add an Item Bought Beyond the Request">
              <ChipRow
                options={ITEM_TYPES}
                selected={addType}
                onSelect={(next) => resetSubDraft(next)}
              />

              {addType === 'thread' || addType === 'sequin' ? (
                <SwatchGrid
                  swatches={SWATCHES.filter((swatch) => !swatch.isCustom).map((swatch) => ({
                    id: swatch.id,
                    label: swatch.label,
                    hex: swatch.hex,
                    useColorSwatch: true,
                  }))}
                  selected={addColor}
                  onSelect={setAddColor}
                />
              ) : null}

              {addType === 'tilla' ? (
                <SwatchGrid
                  swatches={TILLA_SHADES.map((shade) => ({
                    id: shade,
                    label: TILLA_LABELS[shade],
                    hex: TILLA_SWATCHES[shade],
                    useColorSwatch: false,
                  }))}
                  selected={addColor}
                  onSelect={setAddColor}
                />
              ) : null}

              {addType === 'sequin' ? (
                <>
                  <ChipRow
                    options={SEQUIN_SIZES.map((size) => ({
                      value: size,
                      label: `${size}mm`,
                    }))}
                    selected={addSize}
                    onSelect={setAddSize}
                  />
                  <ChipRow
                    options={SEQUIN_CUTS.map((cut) => ({ value: cut, label: cut }))}
                    selected={addCut}
                    onSelect={setAddCut}
                  />
                </>
              ) : null}

              <View style={styles.addTaps}>
                <PriceTap
                  value={
                    addQty === null || addType === null
                      ? null
                      : formatQuantity(addType, addQty, addSize)
                  }
                  placeholder="Qty"
                  label="Quantity bought"
                  disabled={addType === null}
                  onPress={() => setKeypad({ kind: 'addQty' })}
                  style={styles.addTap}
                />
                <PriceTap
                  value={addPrice === null ? null : formatRs(addPrice)}
                  placeholder="Price"
                  label="Price paid"
                  disabled={addType === null}
                  onPress={() => setKeypad({ kind: 'addPrice' })}
                  style={styles.addTap}
                />
              </View>

              {/* Gated rather than a silent no-op: the source mockup let the
                  tap do nothing when a field was missing, which reads as a
                  broken button. Every other gated action in this app disables
                  itself instead, and so does this one. */}
              <Button
                label="Add Item"
                icon="plus"
                tone="outline"
                disabled={
                  !canAddItem({
                    itemType: addType,
                    colorId: addColor,
                    sequinSizeMm: addSize,
                    sequinCutType: addCut,
                    qty: addQty,
                    price: addPrice,
                  })
                }
                onPress={() => {
                  if (addType === null || addQty === null || addPrice === null) return;
                  draft.addAdditional({
                    itemType: addType,
                    colorId: addType === 'bobbin' ? null : addColor,
                    sequinSizeMm: addType === 'sequin' ? addSize : null,
                    sequinCutType: addType === 'sequin' ? addCut : null,
                    qty: addQty,
                    price: addPrice,
                  });
                  resetSubDraft(addType);
                }}
              />
            </Card>
          )}

          <View style={styles.totalCard}>
            <Text style={[type.caption, styles.totalLabel]}>TOTAL BILL</Text>
            <Text style={[type.numeric, styles.totalValue]}>{formatRs(total)}</Text>
          </View>

          {!readOnly && !canSubmit ? (
            <NoteCard text="Add the bill photo, a price on every item, and the actual supplier before submitting." />
          ) : null}

          {error ? (
            <Card tone="danger">
              <Text style={[type.bodyStrong, styles.errorTitle]}>Could not submit</Text>
              <Text style={type.body}>{error}</Text>
            </Card>
          ) : null}
        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.content) }]}
        >
          {readOnly ? (
            <Button label="Back to Queue" tone="secondary" flex onPress={navigation.goBack} />
          ) : (
            <Button
              label="Submit Bill"
              icon="check"
              flex
              disabled={!canSubmit}
              loading={submitting}
              onPress={() => void submit()}
            />
          )}
        </View>
      </View>

      <NumericKeypadSheet
        visible={keypad !== null}
        title={keypadTitle(keypad)}
        initialValue={keypadInitial(keypad, draft.prices, addQty, addPrice)}
        placeholder="Tap to set"
        maxLength={7}
        minLength={1}
        format={(digits) =>
          keypad?.kind === 'addQty' ? Number(digits).toLocaleString() : formatRs(Number(digits))
        }
        // Driven by the target, not by a second keypad component: the unit is a
        // property of the field that opened it.
        unitSuffix={
          keypad?.kind === 'addQty' ? ` ${QUANTITY_UNITS[addType ?? 'thread']}` : undefined
        }
        onSubmit={(digits) => {
          const value = Number(digits);
          if (keypad?.kind === 'itemPrice') draft.setPrice(keypad.itemId, value);
          if (keypad?.kind === 'addQty') setAddQty(value);
          if (keypad?.kind === 'addPrice') setAddPrice(value);
          setKeypad(null);
        }}
        onClose={() => setKeypad(null)}
      />
    </>
  );
}

function keypadTitle(target: KeypadTarget | null): string {
  if (target === null) return '';
  if (target.kind === 'itemPrice') return `Bill price — ${target.label}`;
  return target.kind === 'addQty' ? 'Quantity bought' : 'Price paid';
}

function keypadInitial(
  target: KeypadTarget | null,
  prices: Record<string, number>,
  addQty: number | null,
  addPrice: number | null,
): string {
  if (target === null) return '';
  if (target.kind === 'itemPrice') return prices[target.itemId]?.toString() ?? '';
  if (target.kind === 'addQty') return addQty?.toString() ?? '';
  return addPrice?.toString() ?? '';
}

function LineRow({
  line,
  price,
  disabled,
  onPress,
}: {
  line: PoLine;
  price: number | null;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.lineRow}>
      {line.colorId ? (
        <ColorSwatch colorId={line.colorId} customHex={line.hex} size={26} interactive={false} />
      ) : (
        <View
          style={[
            styles.plainSwatch,
            { backgroundColor: line.hex ?? colors.borderSubtle },
            !line.hex && styles.plainSwatchEmpty,
          ]}
        />
      )}

      <View style={styles.lineText}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {line.label}
        </Text>
        <Text style={type.caption}>{lineQuantity(line)}</Text>
        {line.recommendedSupplier ? (
          <Text style={[type.caption, styles.recommend]}>
            {`Recommend: ${line.recommendedSupplier}`}
          </Text>
        ) : null}
      </View>

      <PriceTap
        value={price === null ? null : formatRs(price)}
        disabled={disabled}
        label={`Bill price for ${line.label}`}
        onPress={onPress}
      />
    </View>
  );
}

function SupplierPicker({
  suppliers,
  loading,
  selectedId,
  disabled,
  onSelect,
}: {
  suppliers: { id: string; name: string }[];
  loading: boolean;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Card title="Actual Supplier Used">
      {loading && suppliers.length === 0 ? (
        <ActivityIndicator color={colors.primary} />
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon="users"
          title="No active suppliers"
          hint="Company Admin adds suppliers to the roster."
        />
      ) : (
        <View style={styles.chips}>
          {suppliers.map((supplier) => {
            const active = supplier.id === selectedId;
            return (
              <Pressable
                key={supplier.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled }}
                disabled={disabled}
                onPress={() => onSelect(supplier.id)}
                style={[styles.chip, active && styles.chipActive, disabled && styles.inert]}
              >
                <Text style={[type.pill, active ? styles.chipLabelActive : styles.chipLabel]}>
                  {supplier.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

function BillPhoto({
  localUri,
  storedPath,
  disabled,
  onCapture,
}: {
  localUri: string | null;
  storedPath: string | null;
  disabled: boolean;
  onCapture: (uri: string) => void;
}) {
  const signed = useSignedPhoto(BUCKETS.billPhotos, storedPath);
  const shown = localUri ?? signed;
  const attached = localUri !== null || storedPath !== null;

  return (
    <Card title="Bill Photo">
      <PhotoTile
        shape="wide"
        height={150}
        photoUri={shown}
        variant={disabled ? 'disabled' : attached ? 'filled' : 'default'}
        label={
          attached
            ? disabled
              ? 'Bill photo'
              : 'Bill Photo Attached — tap to replace'
            : 'Tap to photograph the bill'
        }
        onCapture={onCapture}
      />
    </Card>
  );
}

function ChipRow<T extends string | number>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[type.pill, active ? styles.chipLabelActive : styles.chipLabel]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SwatchGrid({
  swatches,
  selected,
  onSelect,
}: {
  swatches: { id: string; label: string; hex: string | null; useColorSwatch: boolean }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.swatchGrid}>
      {swatches.map((swatch) =>
        swatch.useColorSwatch ? (
          <ColorSwatch
            key={swatch.id}
            colorId={swatch.id}
            size={34}
            variant={swatch.id === selected ? 'selected' : 'default'}
            onPress={() => onSelect(swatch.id)}
          />
        ) : (
          // Tilla shades are not in SWATCHES, so they render as a plain fill
          // with the same selection ring the palette swatches use.
          <Pressable
            key={swatch.id}
            accessibilityRole="button"
            accessibilityLabel={swatch.label}
            accessibilityState={{ selected: swatch.id === selected }}
            hitSlop={6}
            onPress={() => onSelect(swatch.id)}
            style={[styles.tillaRing, swatch.id === selected && styles.tillaRingActive]}
          >
            <View style={[styles.tillaSwatch, { backgroundColor: swatch.hex ?? colors.border }]}>
              {swatch.id === selected ? (
                <Feather name="check" size={16} color={colors.surface} />
              ) : null}
            </View>
          </Pressable>
        ),
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
    marginTop: spacing.content * 3,
  },
  submittedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    padding: spacing.content - 2,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.success,
    backgroundColor: colors.successBg,
  },
  submittedNoteText: {
    flex: 1,
    color: colors.success,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingVertical: spacing.tight,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  plainSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  plainSwatchEmpty: {
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  lineText: {
    flex: 1,
  },
  recommend: {
    color: colors.textMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight - 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.neutralAccent,
  },
  chipLabel: {
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.primary,
  },
  inert: {
    opacity: 0.6,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight + 2,
  },
  tillaRing: {
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  tillaRingActive: {
    backgroundColor: colors.primary,
  },
  tillaSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.surface,
  },
  additionalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    paddingVertical: spacing.tight,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  additionalText: {
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
  additionalPrice: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  addTaps: {
    flexDirection: 'row',
    gap: spacing.tight,
  },
  addTap: {
    flex: 1,
  },
  totalCard: {
    padding: spacing.content,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
    gap: 2,
  },
  totalLabel: {
    color: colors.neutralAccent,
    letterSpacing: 0.6,
  },
  totalValue: {
    fontSize: 26,
    color: colors.surface,
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
