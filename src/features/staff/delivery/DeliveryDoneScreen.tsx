import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, NoteCard, TopBar } from '../../../components';
import { colors, spacing, type } from '../../../theme';
import type { StaffStackParamList } from '../../../navigation/StaffStack';

type Props = NativeStackScreenProps<StaffStackParamList, 'DeliveryDone'>;

/**
 * Confirmation, and one sentence about what it set in motion.
 *
 * The note is the whole point of the screen. Delivery is the moment an order
 * becomes money owed — `mark_delivered` stamped `delivered_at`, and the
 * Accountant's Receivables tab reads exactly that — and the person who just
 * handed over the sheets is the one who needs to know that a bill now exists
 * in somebody else's screen because of what they did.
 */
export function DeliveryDoneScreen({ navigation, route }: Props) {
  const { orderCode, clientName } = route.params;

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Delivered" />

      <View style={styles.content}>
        <View style={styles.badge}>
          <Feather name="check" size={32} color={colors.success} />
        </View>

        <Text style={type.brand}>{orderCode}</Text>
        <Text style={[type.body, styles.centered]}>
          {clientName ? `Handed over to ${clientName}.` : 'Handed over.'}
        </Text>

        <NoteCard
          style={styles.note}
          text="The invoice now sits in the accountant's receivables."
        />
      </View>

      <View style={styles.footer}>
        <Button
          label="Back to Deliveries"
          icon="corner-up-left"
          onPress={() => navigation.navigate('DeliveryQueue')}
        />
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
    justifyContent: 'center',
    padding: spacing.content,
    gap: spacing.block,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  note: {
    alignSelf: 'stretch',
  },
  footer: {
    padding: spacing.content,
  },
});
