import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';
import { BottomSheetModal } from './BottomSheetModal';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export interface NumericKeypadSheetProps {
  visible: boolean;
  /** Sheet heading, e.g. "Client phone number". */
  title: string;
  /** Starting digits; the sheet keeps its own draft until Done. */
  initialValue?: string;
  /** Shown greyed when the draft is empty. */
  placeholder?: string;
  /** Hard cap on digit count — 11 for a local phone number, say. */
  maxLength?: number;
  /** Done stays disabled until the draft is at least this long. */
  minLength?: number;
  /** Formats the live display only; `onSubmit` always receives raw digits. */
  format?: (digits: string) => string;
  /**
   * Unit shown after the value while typing — " Rs", " g", " CDs", " pcs".
   *
   * A prop rather than a second keypad, and rather than being baked into
   * `format`: what a number means changes with the field the keypad was opened
   * from, not with how the digits are grouped. A caller that already formats
   * its own unit into `format` simply leaves this unset.
   */
  unitSuffix?: string;
  onSubmit: (digits: string) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet numeric keypad. Deliberately generic — phone numbers today,
 * quantities and codes later — so it takes digits in and hands digits back
 * rather than knowing anything about phone numbers.
 */
export function NumericKeypadSheet({
  visible,
  title,
  initialValue = '',
  placeholder = 'Enter digits',
  maxLength = 15,
  minLength = 1,
  format,
  unitSuffix,
  onSubmit,
  onClose,
}: NumericKeypadSheetProps) {
  const [draft, setDraft] = useState(initialValue);

  // Re-seed each time the sheet opens so a cancelled edit does not leak into
  // the next one.
  useEffect(() => {
    if (visible) setDraft(initialValue);
  }, [visible, initialValue]);

  const append = (digit: string) =>
    setDraft((current) =>
      current.length >= maxLength ? current : current + digit,
    );
  const backspace = () => setDraft((current) => current.slice(0, -1));
  const clear = () => setDraft('');

  const canSubmit = draft.length >= minLength;

  return (
    <BottomSheetModal visible={visible} onClose={onClose} backdropOpacity={0.35}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={type.heading}>{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            onPress={onClose}
          >
            <Feather name="x" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text
          style={[styles.display, draft.length === 0 && styles.displayEmpty]}
          numberOfLines={1}
        >
          {draft.length === 0
            ? placeholder
            : `${format?.(draft) ?? draft}${unitSuffix ?? ''}`}
        </Text>

        <View style={styles.grid}>
          {KEYS.map((key) => (
            <Key key={key} label={key} onPress={() => append(key)} />
          ))}
          <Key label="Clear" onPress={clear} muted />
          <Key label="0" onPress={() => append('0')} />
          <Key label="backspace" icon="delete" onPress={backspace} muted />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => onSubmit(draft)}
          style={[styles.done, !canSubmit && styles.doneDisabled]}
        >
          <Text style={[type.button, styles.doneLabel]}>Done</Text>
        </Pressable>
      </View>
    </BottomSheetModal>
  );
}

function Key({
  label,
  icon,
  muted,
  onPress,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        muted && styles.keyMuted,
        pressed && styles.keyPressed,
      ]}
    >
      {icon ? (
        <Feather name={icon} size={20} color={colors.textPrimary} />
      ) : (
        <Text style={[styles.keyLabel, muted && styles.keyLabelMuted]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    padding: spacing.content,
    paddingBottom: spacing.content * 2,
    gap: spacing.block,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  display: {
    fontFamily: type.numeric.fontFamily,
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    paddingHorizontal: spacing.content,
    paddingVertical: spacing.tight + 2,
  },
  displayEmpty: {
    color: colors.textMuted,
    fontSize: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight,
  },
  key: {
    // 3 columns: a 30% basis leaves room for the two gaps, and flexGrow shares
    // the remainder out so the row always fills the sheet exactly.
    flexGrow: 1,
    flexBasis: '30%',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  keyMuted: {
    backgroundColor: colors.borderSubtle,
  },
  keyPressed: {
    backgroundColor: colors.border,
  },
  keyLabel: {
    fontFamily: type.numeric.fontFamily,
    fontSize: 24,
    color: colors.textPrimary,
  },
  keyLabelMuted: {
    fontFamily: type.button.fontFamily,
    fontSize: 15,
    color: colors.textSecondary,
  },
  done: {
    height: layout.bottomBarHeight,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneDisabled: {
    opacity: 0.4,
  },
  doneLabel: {
    color: colors.surface,
  },
});
