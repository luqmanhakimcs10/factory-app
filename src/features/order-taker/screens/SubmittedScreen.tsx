import { useCallback } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, Timeline, TopBar } from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'Submitted'>;

/** Terminal screen. Outside the dotted flow — the wizard is over by now. */
export function SubmittedScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const resetWizard = useWizard((state) => state.reset);

  const backToOrders = useCallback(() => {
    // Third and last reset point, alongside the FAB and a successful submit.
    resetWizard();
    // `popToTop`, not `navigate`: Orders List is already at the bottom of this
    // stack with the params it was opened on, and navigating would re-enter it
    // with none — losing `cameFromDashboard` and putting a home header on a
    // screen the person reached from the Staff Dashboard.
    navigation.popToTop();
  }, [navigation, resetWizard]);

  // Terminal screen: there is no back button, and Android's hardware back is
  // redirected to the same exit rather than dropping the taker into a wizard
  // whose order is already submitted.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        backToOrders();
        return true;
      });
      return () => subscription.remove();
    }, [backToOrders]),
  );

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Order Submitted" />

      <View style={styles.content}>
        <View style={styles.check}>
          <Feather name="check" size={34} color={colors.success} />
        </View>

        <Text style={type.title}>Order submitted</Text>
        <Text style={[type.numeric, styles.code]}>{route.params.orderCode}</Text>
        <Text style={[type.label, styles.centered]}>
          It is now in the QA queue for initial inspection.
        </Text>

        <Card style={styles.timelineCard}>
          <Timeline currentStage="inspection" />
        </Card>
      </View>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.content) },
        ]}
      >
        <Button label="Back to My Orders" flex onPress={backToOrders} />
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
  timelineCard: {
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
