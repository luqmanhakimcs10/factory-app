import { useCallback } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, InfoRow, TopBar } from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { formatRs } from '../../../lib/ledgerMath';
import type { ProcurementStackParamList } from '../../../navigation/ProcurementStack';
import { useFulfillDraft } from '../draftStore';

type Props = NativeStackScreenProps<ProcurementStackParamList, 'Submitted'>;

/**
 * Terminal screen. The bill is written by the time this renders.
 *
 * The recap is read off the route params rather than re-fetched: the figures
 * shown are the ones that were just submitted, and a refetch here would put a
 * loading state between the person and the confirmation they are waiting for.
 *
 * Back is redirected the same way the Order Taker's Submitted screen redirects
 * it — returning into a Fulfill screen whose PO has already left
 * `awaitingProcurement` would offer to submit a bill the RPC now rejects.
 */
export function SubmittedScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { poNumber, supplierName, total } = route.params;
  const clearDraft = useFulfillDraft((state) => state.clear);

  const backToQueue = useCallback(() => {
    clearDraft();
    // `popToTop`, not `navigate`: Queue is already at the bottom of this stack
    // with the params it was opened on. Re-entering it with
    // `cameFromDashboard: false` put a module-root home header on a screen the
    // person reached from the Staff Dashboard, stranding them there.
    navigation.popToTop();
  }, [clearDraft, navigation]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        backToQueue();
        return true;
      });
      return () => subscription.remove();
    }, [backToQueue]),
  );

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Bill Submitted" />

      <View style={styles.content}>
        <View style={styles.check}>
          <Feather name="check" size={34} color={colors.success} />
        </View>

        <Text style={type.title}>Bill submitted</Text>
        <Text style={[type.numeric, styles.code]}>{poNumber}</Text>
        <Text style={[type.label, styles.centered]}>
          Awaiting Store Manager Confirmation
        </Text>

        <Card style={styles.recap}>
          <InfoRow
            icon="truck"
            label="Actual Supplier"
            trailing={supplierName || 'Not recorded'}
            divider
          />
          <InfoRow icon="dollar-sign" label="Final Total" trailing={formatRs(total)} />
        </Card>
      </View>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.content) }]}
      >
        <Button label="Back to Queue" flex onPress={backToQueue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.content,
    gap: spacing.tight,
  },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.content * 2,
    marginBottom: spacing.tight,
  },
  code: {
    color: colors.primary,
  },
  centered: {
    textAlign: 'center',
  },
  recap: {
    alignSelf: 'stretch',
    marginTop: spacing.block,
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
