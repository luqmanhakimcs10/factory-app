import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card } from '../../components';
import { supabase } from '../../data/supabase';
import { useSession } from '../../state/session';
import { colors, layout, radius, spacing, type } from '../../theme';

/**
 * Minimal email/password sign-in.
 *
 * Not part of the Order Taker spec, but every screen in the module is scoped
 * by `profiles.factory_id`, so there has to be a way to get a session on the
 * device. Replace with the real ERP sign-in (phone/PIN for floor staff) when
 * that lands.
 */
export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Authentication can succeed and the session still fail to establish — a
  // missing or unreadable profile row. That reason surfaces here too, so the
  // screen never just sits there after a successful sign-in.
  const sessionError = useSession((state) => state.error);

  const signIn = async () => {
    setBusy(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) setError(signInError.message);
    setBusy(false);
    // On success the auth listener in useSessionBootstrap swaps the navigator.
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Text style={type.brand}>FactoryERP</Text>
        <Text style={type.label}>Sign in to your factory</Text>

        <Card style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error || sessionError ? (
            <Text style={[type.caption, styles.error]}>{error ?? sessionError}</Text>
          ) : null}
          <Button
            label="Sign in"
            loading={busy}
            disabled={!email || !password}
            onPress={signIn}
          />
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.content,
    gap: spacing.hair,
  },
  card: {
    marginTop: spacing.block,
  },
  input: {
    height: 48,
    paddingHorizontal: spacing.content - 2,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    fontFamily: type.body.fontFamily,
    fontSize: 15,
    color: colors.textPrimary,
  },
  error: {
    color: colors.danger,
  },
});
