import { Alert, Platform } from 'react-native';

/**
 * Cross-platform dialogs.
 *
 * React Native Web ships no `Alert` implementation — calling `Alert.alert`
 * in a browser does nothing at all, so a failure reported that way is
 * indistinguishable from the button not working. Every user-facing dialog goes
 * through here so neither platform can silently swallow one.
 */

/** Tell the user something went wrong. Fire-and-forget. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export interface ChoiceOption<T> {
  label: string;
  value: T;
}

/**
 * Ask the user to pick one of two options, or cancel.
 *
 * Resolves to `null` when they back out. The web branch uses `confirm`, which
 * only has room for two answers: the first option is the confirm, the second
 * is the dismiss, and there is no separate cancel. That is the honest mapping
 * for a two-option prompt — the browser has nothing richer to offer.
 */
export function chooseOne<T>(
  title: string,
  first: ChoiceOption<T>,
  second: ChoiceOption<T>,
): Promise<T | null> {
  if (Platform.OS === 'web') {
    const takeFirst = globalThis.confirm?.(
      `${title}\n\nOK — ${first.label}\nCancel — ${second.label}`,
    );
    return Promise.resolve(takeFirst ? first.value : second.value);
  }

  return new Promise((resolve) => {
    Alert.alert(title, undefined, [
      { text: first.label, onPress: () => resolve(first.value) },
      { text: second.label, onPress: () => resolve(second.value) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

/**
 * Confirm something consequential before it happens.
 *
 * Resolves false when the user backs out, so the caller's default is always
 * "do nothing". Used for the platform console's Deactivate, where cutting a
 * tenant's access off deserves a deliberate second tap — its Activate
 * counterpart intentionally has no confirmation at all.
 */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
