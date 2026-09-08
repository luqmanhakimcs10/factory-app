import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { PhotoTile } from '../../components';
import { BUCKETS } from '../../data/storage';
import { useSignedPhoto } from '../../data/useSignedPhoto';
import { colors, fonts, layout, radius, spacing, type } from '../../theme';
import { isLocalPhotoUri } from './rosters';

/**
 * The form and roster primitives the five master-data screens share.
 *
 * They live here rather than in `/src/components` because the shape they
 * encode is this module's: a small uppercase caption above a field rather than
 * a `Card` with a heading, which is what the rest of the app uses and what the
 * source mockup does *not* do on these screens. Five near-identical forms with
 * five copies of a labelled text input is how field order and gating rules
 * drift apart between them.
 */

// --- Field scaffolding ------------------------------------------------------

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={[type.caption, styles.fieldLabel]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType,
  multiline = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (next: string) => void;
  keyboardType?: 'default' | 'phone-pad';
  /** Address fields; everything else is a single line. */
  multiline?: boolean;
}) {
  return (
    <Field label={label}>
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </Field>
  );
}

/**
 * A value the admin cannot change on this screen.
 *
 * Rendered as a genuinely different control from the chip pickers beside it —
 * flat grey, no border, not pressable — rather than as a disabled picker. A
 * greyed-out picker says "you may set this later"; these two fields (an
 * employee's salary basis when they are not a machine worker, a finishing
 * partner's rate basis) have exactly one legal value and no later.
 */
export function StaticTextField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <View style={styles.static}>
        <Text style={[type.code, styles.staticValue]}>{value}</Text>
      </View>
    </Field>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function ChipField<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly ChipOption<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <View style={styles.chips}>
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <Pressable
              key={option.value}
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
    </Field>
  );
}

/**
 * The same chips, but any number of them at once.
 *
 * Separate from `ChipField` rather than a `multi` flag on it: the two differ in
 * the type of `selected`, in the accessibility role they publish (checkbox, not
 * radio) and in what a tap means — selecting versus toggling. One component
 * doing both would be a union type and three conditionals to save a stylesheet.
 */
export function MultiChipField<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly ChipOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <View style={styles.chips}>
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => onToggle(option.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[type.pill, active ? styles.chipLabelActive : styles.chipLabel]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

export interface PickerOption {
  id: string;
  label: string;
  /** The small second line — a role, a phone number. */
  subLabel: string;
}

/**
 * Pick at most one row out of a list, with a filter box above it.
 *
 * Deliberately inline rather than a modal or a pushed screen: this is an
 * optional field on a long form, and sending the admin to another screen to
 * answer "does this person have a login?" costs more than the field is worth.
 *
 * The list is capped and says so when it is truncated — an unbounded list
 * inside a scrolling form swallows every field under it.
 */
export function SearchPickerField({
  label,
  placeholder,
  emptyLabel,
  options,
  selectedId,
  onSelect,
}: {
  label: string;
  placeholder: string;
  /** Shown in place of the list when nothing matches. */
  emptyLabel: string;
  options: readonly PickerOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [search, setSearch] = useState('');

  const needle = search.trim().toLowerCase();
  const matches = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;
  const shown = matches.slice(0, PICKER_ROW_LIMIT);
  const hidden = matches.length - shown.length;

  return (
    <Field label={label}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />

      {shown.length === 0 ? (
        <Text style={[type.label, styles.footnote]}>{emptyLabel}</Text>
      ) : (
        <View style={styles.pickerList}>
          {shown.map((option) => {
            const active = option.id === selectedId;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                // Tapping the selected row clears it: the field is optional, and
                // without this there is no way back to "no login" once one is set.
                onPress={() => onSelect(active ? null : option.id)}
                style={[styles.pickerRow, active && styles.pickerRowActive]}
              >
                <View style={styles.rosterName}>
                  <Text style={type.bodyStrong} numberOfLines={1}>
                    {option.label}
                  </Text>
                  <Text style={type.label} numberOfLines={1}>
                    {option.subLabel}
                  </Text>
                </View>
                {active ? <Feather name="check" size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {hidden > 0 ? (
        <Text style={[type.label, styles.footnote]}>
          {`${hidden} more — keep typing to narrow the list.`}
        </Text>
      ) : null}
    </Field>
  );
}

const PICKER_ROW_LIMIT = 6;

/**
 * A field that opens the shared numeric keypad rather than the OS one.
 *
 * Same control on every screen in this module that takes an amount, and the
 * same one the rest of the app already uses for money: a factory floor types
 * amounts on a big grid, not on a phone keyboard.
 *
 * Not only money, despite the name — a bonus threshold and a finishing
 * partner's SLA go through it too, which is what `icon` is for.
 */
export function PriceField({
  label,
  value,
  icon = 'droplet',
  onPress,
}: {
  label: string;
  /** Already formatted, or null for the untouched "Tap to set" state. */
  value: string | null;
  icon?: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
}) {
  return (
    <Field label={label}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}, ${value}` : `Set ${label}`}
        onPress={onPress}
        style={styles.price}
      >
        <View style={styles.priceIcon}>
          <Feather name={icon} size={16} color={colors.primary} />
        </View>
        <Text style={[type.code, value ? styles.priceValue : styles.priceEmpty]}>
          {value ?? 'Tap to set'}
        </Text>
      </Pressable>
    </Field>
  );
}

/**
 * A photo field that holds whatever the row will store, not what renders.
 *
 * `value` is a freshly captured local URI on a new capture and the existing
 * storage path when an already-saved row is reopened. The bucket is private, so
 * a stored path is nothing an `<Image>` can load — it is signed here for
 * display only, and `value` goes back to the caller unchanged so re-saving an
 * untouched photo does not upload a second copy of it.
 *
 * The tile reads as filled from the moment there is a value, not from the
 * moment the signed URL arrives: the fact that a photo exists is known
 * immediately, and flickering "no photo" while a URL resolves is a lie.
 */
export function PhotoField({
  label,
  prompt,
  value,
  onCapture,
}: {
  label: string;
  /** "Tap to photograph the CNIC" — the empty tile's own caption. */
  prompt: string;
  value: string | null;
  onCapture: (uri: string) => void;
}) {
  const local = value !== null && isLocalPhotoUri(value);
  const signed = useSignedPhoto(BUCKETS.employeeDocs, local ? null : value);

  return (
    <Field label={label}>
      <PhotoTile
        shape="wide"
        height={140}
        photoUri={local ? value : signed}
        variant={value ? 'filled' : 'default'}
        label={value ? 'Photo added' : prompt}
        onCapture={onCapture}
      />
    </Field>
  );
}

// --- Roster list ------------------------------------------------------------

/**
 * Small tag on a row — a role, a stage, an inventory type, a machine's status.
 *
 * Distinct from the shared `StatusPill`, which carries an icon and a fixed
 * label per status. This one only ever shows the word it is given.
 */
export function RosterPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  /**
   * `active` is the amber a running machine gets, `earned` the green of a
   * bonus a worker's average currently qualifies for. Everything else is grey.
   */
  tone?: 'neutral' | 'active' | 'earned';
}) {
  return (
    <View style={[styles.rosterPill, TONES[tone].pill]}>
      <Text style={[type.pill, TONES[tone].label]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const TONES = {
  neutral: { pill: undefined, label: { color: colors.textSecondary } },
  active: {
    pill: { backgroundColor: colors.warningBg },
    label: { color: colors.warning },
  },
  earned: {
    pill: { backgroundColor: colors.successBg },
    label: { color: colors.success },
  },
} as const;

export interface RosterEntry {
  id: string;
  name: string;
  /** The tag on the right of the name. */
  pill: string;
  /** The one line under the name — contact, terms, dates. */
  subLabel: string;
  active: boolean;
}

export function RosterRow({
  entry,
  onPress,
}: {
  entry: RosterEntry;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={entry.name}
      onPress={onPress}
      style={({ pressed }) => [styles.rosterRow, pressed && styles.pressed]}
    >
      <View style={styles.rosterHeader}>
        <Text style={[type.bodyStrong, styles.rosterName]} numberOfLines={1}>
          {entry.name}
        </Text>
        <RosterPill label={entry.pill} />
      </View>
      <Text style={type.label} numberOfLines={2}>
        {entry.subLabel}
      </Text>
    </Pressable>
  );
}

/** The small grey caption that heads a section — "ACTIVE (5)". */
export function SectionLabel({ children, style }: { children: string; style?: ViewStyle }) {
  return (
    <Text style={[type.caption, styles.sectionLabel, style]}>
      {children.toUpperCase()}
    </Text>
  );
}

/** A paragraph of explanation under a list. Verbatim copy, never paraphrased. */
export function FootnoteCaption({ children }: { children: string }) {
  return <Text style={[type.label, styles.footnote]}>{children}</Text>;
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.hair + 2,
  },
  fieldLabel: {
    letterSpacing: 0.55,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.content - 2,
    paddingVertical: spacing.tight + 2,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    fontFamily: type.body.fontFamily,
    fontSize: 15,
    color: colors.textPrimary,
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  static: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.content - 2,
    paddingVertical: spacing.tight + 2,
    borderRadius: radius.card,
    backgroundColor: colors.draftBg,
  },
  staticValue: {
    fontSize: 15,
    color: colors.textPrimary,
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
  price: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    minHeight: 72,
    paddingHorizontal: spacing.content - 2,
    paddingVertical: spacing.tight + 2,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  priceIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.icon,
    backgroundColor: colors.neutralAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceValue: {
    fontSize: 18,
    color: colors.textPrimary,
  },
  priceEmpty: {
    fontSize: 18,
    color: colors.textMuted,
  },
  rosterRow: {
    gap: spacing.hair + 2,
    padding: spacing.content - 2,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.85,
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  rosterName: {
    flex: 1,
  },
  pickerList: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
    minHeight: 56,
    paddingHorizontal: spacing.content - 2,
    paddingVertical: spacing.tight,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.borderSubtle,
  },
  pickerRowActive: {
    backgroundColor: colors.neutralAccent,
  },
  rosterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.draftBg,
  },

  sectionLabel: {
    letterSpacing: 0.55,
    marginTop: spacing.hair,
  },
  footnote: {
    color: colors.textMuted,
  },
});

/** Shared by the report tabs for their big mono figures. */
export const reportStyles = StyleSheet.create({
  figure: {
    fontFamily: fonts.mono.bold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.textPrimary,
  },
});
