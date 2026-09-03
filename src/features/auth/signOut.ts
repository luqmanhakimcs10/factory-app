import { Alert, Platform } from 'react-native';

import { supabase } from '../../data/supabase';

/**
 * Sign out, after confirming.
 *
 * Confirmation matters on a factory floor — a stray tap that drops someone out
 * of a half-finished order is worse than one extra press. React Native Web has
 * no `Alert` implementation, so the browser gets `window.confirm` instead;
 * using `Alert` on both would make the button silently do nothing on web.
 */
export function confirmSignOut(): void {
  if (Platform.OS === 'web') {
    const ok = globalThis.confirm?.('Sign out of FactoryERP?') ?? true;
    if (ok) void supabase.auth.signOut();
    return;
  }

  Alert.alert('Sign out', 'Sign out of FactoryERP?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Sign out',
      style: 'destructive',
      onPress: () => void supabase.auth.signOut(),
    },
  ]);
}
