import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card } from '../../components';
import { colors, spacing, type } from '../../theme';
import type { UserRole } from '../../data/types';
import { builtRoleSentence, ROLE_LABELS } from '../../navigation/roleStacks';
import { confirmSignOut } from './signOut';

export interface UnavailableRoleScreenProps {
  role: UserRole;
  fullName: string;
  factoryName: string | null;
}

/**
 * Terminal screen for a role with no module built yet.
 *
 * Deliberately shows nothing else — not even read-only access to another role's
 * module. Those screens are not theirs until that role's own build pass
 * happens, and RLS is the backstop for that rule, not the mechanism.
 */
export function UnavailableRoleScreen({
  role,
  fullName,
  factoryName,
}: UnavailableRoleScreenProps) {
  const insets = useSafeAreaInsets();
  const label = ROLE_LABELS[role] ?? role;

  // Generated from `ROLE_STACKS`, not written out here. The previous hardcoded
  // sentence still named three modules two prompts after the fourth and fifth
  // shipped, which is the whole reason this reads off the routing table.
  const covered = builtRoleSentence();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.content }]}>
      <View style={styles.body}>
        <View style={styles.icon}>
          <Feather name="clock" size={28} color={colors.warning} />
        </View>

        <Text style={type.title}>Your role isn't available in this app yet</Text>
        <Text style={[type.label, styles.centered]}>
          FactoryERP currently covers {covered}. The {label} module has not been built.
        </Text>

        <Card style={styles.card}>
          <Text style={type.caption}>SIGNED IN AS</Text>
          <Text style={type.bodyStrong}>{fullName}</Text>
          <Text style={type.code}>{label}</Text>
          {factoryName ? <Text style={type.label}>{factoryName}</Text> : null}
        </Card>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.content) }]}>
        <Button label="Sign out" tone="secondary" icon="log-out" flex onPress={confirmSignOut} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.content,
    gap: spacing.tight,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.tight,
  },
  centered: {
    textAlign: 'center',
  },
  card: {
    alignSelf: 'stretch',
    marginTop: spacing.block,
    gap: 2,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.content,
  },
});
