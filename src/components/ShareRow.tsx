import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, radius, spacing, type } from '../theme';

export interface ShareRowProps {
  /** The text handed to the OS share sheet. */
  message: string;
  /** Share-sheet dialog title (Android). */
  title?: string;
  label?: string;
  sharedLabel?: string;
}

/**
 * Tap target that opens the real OS share sheet, then latches to a confirmed
 * state once something was actually shared.
 *
 * `Share.share` reports `dismissedAction` when the user backs out, so the row
 * only turns green if the message really went somewhere — it is not a toggle.
 *
 * Shares plain text today. A rendered job-card PDF would be the better payload;
 * that needs a PDF pipeline this app does not have yet.
 */
export function ShareRow({
  message,
  title = 'Job Card',
  label = 'Share with client',
  sharedLabel = 'Shared with client',
}: ShareRowProps) {
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const result = await Share.share({ message, title }, { dialogTitle: title });
      if (result.action === Share.sharedAction) setShared(true);
    } catch {
      // A failed or cancelled share leaves the row in its unshared state, which
      // is the honest reading — nothing reached the client.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shared ? sharedLabel : label}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={share}
      style={[styles.row, shared && styles.rowShared]}
    >
      <View style={[styles.iconCircle, shared && styles.iconCircleShared]}>
        <Feather
          name={shared ? 'check' : 'share-2'}
          size={16}
          color={shared ? colors.surface : colors.primary}
        />
      </View>
      <Text style={[type.bodyStrong, shared && styles.labelShared]}>
        {shared ? sharedLabel : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    padding: spacing.content - 2,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  rowShared: {
    borderStyle: 'solid',
    borderColor: colors.success,
    backgroundColor: colors.successBg,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutralAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleShared: {
    backgroundColor: colors.success,
  },
  labelShared: {
    color: colors.success,
  },
});
