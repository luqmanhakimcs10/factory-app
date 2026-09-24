import { useState } from 'react';
import { View } from 'react-native';

import { NumericKeypadSheet, Stepper } from '../../components';
import type { StockType } from '../../data/types';
import {
  STOCK_TYPES,
  TYPE_META,
  fmt,
  onHand,
  openLotsOf,
  qtyLine,
  type StockBook,
} from './api';
import { Chips, FieldLabel, Note, TapField } from './components';

/**
 * Pick a code and a quantity — the one form behind Record a Sale, both legs of
 * an Exchange and a Purchase Order line.
 *
 * `mode: 'out'` means stock leaves: each code chip shows what is on hand, the
 * FIFO order it will drain in is spelled out, and overdrawing is flagged.
 */

export interface PickDraft {
  type: StockType;
  stockItemId: string | null;
  qty: number;
  yards: number;
  value: number;
  party: string | null;
}

export const newPick = (type: StockType = 'thread'): PickDraft => ({
  type,
  stockItemId: null,
  qty: 1,
  yards: type === 'sequin' ? 915 : 2625,
  value: 0,
  party: null,
});

type KeypadTarget = 'qty' | 'yards' | 'value' | null;

export interface ItemPickerProps {
  book: StockBook;
  draft: PickDraft;
  onChange: (next: PickDraft) => void;
  mode: 'in' | 'out';
  yardsLabel?: string;
  yardsHint?: string;
  valueLabel?: string;
  partyLabel?: string;
  parties?: { value: string; label: string }[];
}

export function pickReady(props: Pick<ItemPickerProps, 'book' | 'draft' | 'mode' | 'valueLabel' | 'parties'>) {
  const { book, draft, mode } = props;
  if (!draft.stockItemId || draft.qty < 1) return false;
  if (mode === 'out' && draft.qty > onHand(book, draft.stockItemId)) return false;
  if (props.valueLabel && !draft.value) return false;
  if (props.parties && !draft.party) return false;
  return true;
}

export function ItemPicker(props: ItemPickerProps) {
  const { book, draft, onChange, mode } = props;
  const [keypad, setKeypad] = useState<KeypadTarget>(null);
  const meta = TYPE_META[draft.type];
  const codes = book.codes.filter((code) => code.type === draft.type);
  const picked = book.codes.find((code) => code.id === draft.stockItemId) ?? null;
  const available = picked ? onHand(book, picked.id) : 0;
  const overdraw = mode === 'out' && picked !== null && draft.qty > available;

  const set = (patch: Partial<PickDraft>) => onChange({ ...draft, ...patch });

  return (
    <>
      <View>
        <FieldLabel>Inventory Type</FieldLabel>
        <Chips
          options={STOCK_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label }))}
          selected={draft.type}
          onSelect={(type) => onChange({ ...newPick(type), party: draft.party, value: draft.value })}
        />
      </View>

      <View>
        <FieldLabel>Code</FieldLabel>
        <Chips
          options={codes.map((code) => ({
            value: code.id,
            label: mode === 'out' ? `${code.code} · ${fmt(onHand(book, code.id))}` : code.code,
          }))}
          selected={draft.stockItemId}
          onSelect={(stockItemId) => set({ stockItemId })}
        />
      </View>

      {picked && mode === 'out' ? (
        <Note
          tone="plain"
          text={`On hand: ${qtyLine(book, picked)} across ${openLotsOf(book, picked.id).length} lot(s). FIFO drains ${
            openLotsOf(book, picked.id)
              .map((lot) => lot.party.name)
              .join(' then ') || '—'
          }.`}
        />
      ) : null}

      <View>
        <FieldLabel>{`Quantity — ${meta.unitPl}`}</FieldLabel>
        <Stepper value={draft.qty} onChange={(qty) => set({ qty })} min={1} max={9_999_999} bigStep={10} />
        <TapField
          icon="hash"
          value={`${fmt(draft.qty)} ${meta.unitPl}`}
          hint="Tap to type an exact quantity"
          onPress={() => setKeypad('qty')}
        />
        {overdraw ? (
          <View style={{ marginTop: 8 }}>
            <Note tone="warn" text={`Only ${fmt(available)} ${meta.unitPl} on hand. Reduce the quantity.`} />
          </View>
        ) : null}
      </View>

      {props.yardsLabel && meta.hasYards ? (
        <View>
          <FieldLabel>{`${props.yardsLabel} ${meta.unit}`}</FieldLabel>
          <TapField
            icon="maximize-2"
            value={`${fmt(draft.yards)} yd`}
            hint={props.yardsHint ?? 'Tap to change'}
            onPress={() => setKeypad('yards')}
          />
        </View>
      ) : null}

      {props.valueLabel ? (
        <View>
          <FieldLabel>{props.valueLabel}</FieldLabel>
          <TapField
            icon="file-text"
            value={`Rs. ${fmt(draft.value)}`}
            hint="Tap to enter"
            onPress={() => setKeypad('value')}
          />
        </View>
      ) : null}

      {props.parties ? (
        <View>
          <FieldLabel>{props.partyLabel ?? 'Party'}</FieldLabel>
          <Chips options={props.parties} selected={draft.party} onSelect={(party) => set({ party })} />
        </View>
      ) : null}

      <NumericKeypadSheet
        visible={keypad !== null}
        title={keypad === 'qty' ? 'Quantity' : keypad === 'yards' ? 'Yards per unit' : props.valueLabel ?? 'Value'}
        initialValue=""
        placeholder="—"
        maxLength={7}
        minLength={1}
        format={(digits) => (keypad === 'value' ? `Rs. ${fmt(Number(digits))}` : fmt(Number(digits)))}
        unitSuffix={keypad === 'qty' ? ` ${meta.unitPl}` : keypad === 'yards' ? ' yd' : undefined}
        onSubmit={(digits) => {
          const n = Number(digits);
          if (keypad === 'qty') set({ qty: Math.max(1, n) });
          if (keypad === 'yards') set({ yards: n });
          if (keypad === 'value') set({ value: n });
          setKeypad(null);
        }}
        onClose={() => setKeypad(null)}
      />
    </>
  );
}
